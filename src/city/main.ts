import '@fontsource/barlow-condensed/700.css';
import '@fontsource-variable/inter';
import '../styles/tokens.css';
import '../styles/ui.css';
import './city.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SkyDome } from './sky';
import { buildWorld, CITY_HALF, CELL, LANE, radialSpriteTexture } from './world';
import { Car } from './vehicle';
import { Player } from './player';
import { Traffic } from './traffic';
import { Missions } from './missions';
import { Input } from './input';
import { mountHud } from './hud';
import { createPost } from './post';
import { CityAudio } from './audio';
import { detectQuality, type Tier } from '../render/quality';

async function boot(): Promise<void> {
  const forced = new URLSearchParams(location.search).get('q') as Tier | null;
  const tier: Tier = forced && ['high', 'balanced', 'battery'].includes(forced) ? forced : await detectQuality();
  const gameRoot = document.getElementById('game')!;
  const renderer = new THREE.WebGLRenderer({ antialias: tier !== 'high', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier === 'high' ? 2 : tier === 'balanced' ? 1.5 : 1));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = tier !== 'battery';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'gl';
  gameRoot.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(0xd9a070, 0.0022);
  scene.fog = fog;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 5000);
  const skyDome = new SkyDome(scene, tier !== 'battery', tier === 'high' ? 4096 : 2048);
  const startHour = Number(new URLSearchParams(location.search).get('hour'));
  if (!Number.isNaN(startHour) && startHour > 0) skyDome.hour = startHour;

  const world = buildWorld(scene, 7, tier);

  // Street lamp pool: real point lights follow the nearest lamps.
  const lampPool: THREE.PointLight[] = [];
  const poolSize = tier === 'high' ? 8 : tier === 'balanced' ? 5 : 3;
  for (let i = 0; i < poolSize; i++) {
    const l = new THREE.PointLight(0xffd58a, 0, 34, 1.6);
    scene.add(l);
    lampPool.push(l);
  }

  // Player and car.
  const player = new Player();
  scene.add(player.mesh);
  const car = new Car(0xd9d9d9, tier === 'high', true, 'sports');
  // Spawn on the road next to the central plaza, player on the adjacent sidewalk.
  const spawnZ = -CITY_HALF + 3 * CELL + LANE / 2 + 0.3;
  car.place(-CELL * 0.5, spawnZ, Math.PI / 2);
  scene.add(car.mesh);
  player.pos.set(-CELL * 0.5 - 4, 0, spawnZ + 7.5);
  player.heading = Math.PI;

  const traffic = new Traffic(scene, world, tier === 'high' ? 26 : tier === 'balanced' ? 18 : 10, tier === 'battery' ? 24 : 48);
  const missions = new Missions(scene);
  const input = new Input();
  const hud = mountHud(document.getElementById('hud')!, input);
  const audio = new CityAudio();
  const post = createPost(renderer, scene, camera, tier);
  post.resize(innerWidth, innerHeight);

  // Rain.
  const rainCount = tier === 'high' ? 2600 : tier === 'balanced' ? 1400 : 500;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainCount * 6);
  for (let i = 0; i < rainCount; i++) {
    const x = (Math.random() - 0.5) * 80;
    const y = Math.random() * 40;
    const z = (Math.random() - 0.5) * 80;
    rainPos.set([x, y, z, x + 0.15, y + 0.9, z], i * 6);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaac4ff, transparent: true, opacity: 0.35, depthWrite: false }));
  scene.add(rain);

  // Drift smoke particles.
  const smokeTex = radialSpriteTexture();
  const smoke: { s: THREE.Sprite; life: number }[] = [];
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xcfc8d8, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false;
    scene.add(s);
    smoke.push({ s, life: 0 });
  }
  let smokeIdx = 0;

  missions.onEvent = (e) => {
    if (e.type !== 'start') hud.toast(e.text, e.type === 'complete' ? 'good' : e.type === 'fail' ? 'bad' : 'info');
    if (e.type === 'complete') {
      audio.chime('cash');
      hud.flash();
    }
    if (e.type === 'checkpoint') audio.chime('checkpoint');
    if (e.type === 'fail') audio.chime('fail');
  };

  // Intro / audio unlock.
  const intro = document.getElementById('intro')!;
  const playBtn = document.getElementById('play')!;
  document.getElementById('loading')?.classList.add('hidden');
  playBtn.classList.remove('hidden');
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    intro.classList.add('hidden');
    audio.resume();
    hud.prompt('Walk to the silver car and press E (or ENTER) to get in');
    setTimeout(() => hud.prompt(null), 5000);
  };
  playBtn.addEventListener('click', start);
  window.addEventListener('keydown', (e) => e.key === 'Enter' && start(), { once: true });

  // Camera state.
  let camYaw = Math.PI;
  const camPos = new THREE.Vector3(player.pos.x, 3, player.pos.z + 6);
  const camLook = new THREE.Vector3();
  let camMode = 0; // 0 chase, 1 far chase, 2 hood
  let cinematic = 1; // establishing orbit on start

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    post.resize(innerWidth, innerHeight);
  };
  window.addEventListener('resize', resize);

  const clock = new THREE.Clock();
  let t = 0;
  let hornOn = false;
  let lastCrash = 0;
  let mapAcc = 0;
  let lastNight = -1;
  let lastAtmWarm = 0;
  let carLights = false;
  let playerCar: Car = car;
  let wanted = 0;
  let wantedHeat = 0;
  let wantedCool = 0;
  let lastHits = 0;
  let lastRammed = 0;

  const tick = (dt: number) => {
    t += dt;
    const inp = input.poll();
    const allCars = [car, ...traffic.cars];
    let pc = playerCar;

    if (started) {
      cinematic = Math.max(0, cinematic - dt * 0.35);
      if (inp.camera) camMode = (camMode + 1) % 3;
      // Enter / exit a car: the nearest one within reach, your own or anyone's.
      if (inp.action) {
        if (player.inCar) {
          player.inCar = null;
          player.pos.copy(pc.pos).addScaledVector(new THREE.Vector3(pc.forward.z, 0, -pc.forward.x), -2.4);
          player.heading = pc.heading;
          pc.input = { throttle: 0, brake: 0, steer: 0, handbrake: true };
          hud.prompt(null);
        } else {
          const own = player.pos.distanceTo(car.pos) < 6 ? car : null;
          const target = own ?? traffic.nearestCar(player.pos, 4.5, null);
          if (target) {
            if (target !== car) {
              traffic.release(target);
              target.ai = false;
              (target as any).__maxOverride = undefined;
              wanted = Math.min(3, wanted + 1);
              wantedHeat = 1;
              hud.toast('Stolen car! The police are looking for you.', 'bad');
            }
            playerCar = target;
            pc = target;
            player.inCar = target;
            hud.prompt(null);
          }
        }
      }
      if (inp.reset && player.inCar) pc.place(pc.pos.x, pc.pos.z, pc.heading);
      if (player.inCar) {
        pc.input = { throttle: inp.throttle, brake: inp.brake, steer: inp.x, handbrake: inp.handbrake };
        pc.update(dt, world.solids, allCars);
        if (pc.lastHit > 6 && t - lastCrash > 0.4) {
          lastCrash = t;
          audio.chime('crash');
          hud.flash();
        }
        pc.lastHit = 0;
      } else {
        const near = traffic.nearestCar(player.pos, 4.5, null);
        const ownNear = player.pos.distanceTo(car.pos) < 6;
        hud.prompt(ownNear ? (input.touchUsed ? 'Tap ENTER to get in' : 'Press E to get in') : near ? (input.touchUsed ? 'Tap ENTER to take this car' : 'Press E to take this car') : null);
      }
      // Cars the player is not driving idle with the parking brake on.
      for (const c of allCars) if (c !== pc && !c.ai && !traffic.police.some((p) => p.car === c)) {
        c.input = { throttle: 0, brake: 0, steer: 0, handbrake: true };
        c.update(dt, world.solids, allCars);
      }
      player.update(dt, inp.x, inp.y, inp.run, camYaw, world.solids, allCars, t);
      const chase = wanted > 0 ? (player.inCar ? pc.pos : player.pos) : null;
      traffic.update(dt, player.inCar ? pc : null, allCars, world.solids, t, chase);
      missions.update(dt, player.inCar ? pc.pos : player.pos, t, !!player.inCar);
      // Wanted level: hitting pedestrians or ramming traffic raises it; it cools off when you behave.
      if (traffic.hits > lastHits) {
        lastHits = traffic.hits;
        wantedHeat += 0.6;
      }
      if (traffic.rammed > lastRammed) {
        lastRammed = traffic.rammed;
        wantedHeat += 0.35;
      }
      if (wantedHeat >= 1) {
        wanted = Math.min(3, wanted + 1);
        wantedHeat = 0;
        audio.chime('fail');
      }
      wantedHeat = Math.max(0, wantedHeat - dt * 0.04);
      if (wanted > 0) {
        const needed = wanted * 2;
        if (traffic.police.length < needed) traffic.spawnPolice(player.inCar ? pc.pos : player.pos);
        // Lose the heat after 25 s with no police within 60 m.
        const nearest = traffic.police.reduce((m, p) => Math.min(m, p.car.pos.distanceTo(player.inCar ? pc.pos : player.pos)), 1e9);
        if (nearest > 60) wantedCool += dt;
        else wantedCool = 0;
        if (wantedCool > 25) {
          wanted--;
          wantedCool = 0;
          if (wanted === 0) {
            traffic.removePolice();
            hud.toast('You lost them.', 'good');
          }
        }
        audio.siren(true, Math.min(1, nearest / 120));
      } else {
        audio.siren(false, 1);
        if (traffic.police.length) traffic.removePolice();
      }
      hud.setWanted(wanted, 3);
      if (inp.horn !== hornOn) {
        hornOn = inp.horn;
        audio.horn(hornOn && !!player.inCar);
      }
      audio.setEngine(Math.min(1, pc.kmh / 165), player.inCar ? inp.throttle : 0, !!player.inCar);
      audio.setSkid(player.inCar ? pc.drifting * Math.min(1, pc.kmh / 40) : 0);
      // Smoke when drifting.
      if (player.inCar && pc.drifting > 0.35 && pc.kmh > 20) {
        for (const sx of [-0.9, 0.9]) {
          const p = smoke[smokeIdx++ % smoke.length];
          p.s.visible = true;
          p.life = 1;
          p.s.position.copy(pc.pos).add(new THREE.Vector3(pc.forward.z * sx, 0.3, -pc.forward.x * sx)).addScaledVector(pc.forward, -1.6);
          p.s.scale.set(1.2, 1.2, 1);
        }
      }
    }
    for (const p of smoke) {
      if (!p.s.visible) continue;
      p.life -= dt * 1.2;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      p.s.position.y += dt * 1.2;
      const sc = 1.2 + (1 - p.life) * 3;
      p.s.scale.set(sc, sc, 1);
      (p.s.material as THREE.SpriteMaterial).opacity = p.life * 0.35;
    }

    // Camera.
    const focus = player.inCar ? pc.pos : player.pos;
    const fwd = player.inCar ? pc.forward.clone() : new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    if (cinematic > 0) {
      const a = t * 0.25;
      const target = new THREE.Vector3(focus.x + Math.sin(a) * 26, 9 + cinematic * 20, focus.z + Math.cos(a) * 26);
      camPos.lerp(target, Math.min(1, dt * 2));
      camLook.lerp(new THREE.Vector3(focus.x, 2, focus.z), Math.min(1, dt * 3));
    } else if (player.inCar) {
      const speed01 = Math.min(1, pc.kmh / 165);
      const dist = camMode === 1 ? 11 : camMode === 2 ? -2.3 : 6.8 + speed01 * 3;
      const height = camMode === 1 ? 4.5 : camMode === 2 ? 1.35 : 2.6 + speed01 * 0.6;
      const lateral = camMode === 2 ? 0 : -pc.steer * 0.8;
      const target = focus.clone().addScaledVector(fwd, -dist).add(new THREE.Vector3(fwd.z * lateral, height, -fwd.x * lateral));
      camPos.lerp(target, Math.min(1, dt * (camMode === 2 ? 30 : 5.5)));
      camLook.lerp(focus.clone().addScaledVector(fwd, camMode === 2 ? 30 : 5 + speed01 * 8).add(new THREE.Vector3(0, 1.1, 0)), Math.min(1, dt * 8));
      camYaw = pc.heading;
      camera.fov += (62 + speed01 * 14 - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    } else {
      // On foot: camera stays behind the walking direction, with gentle yaw follow.
      let dy = player.heading - camYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      camYaw += dy * Math.min(1, dt * (player.vel.length() > 0.5 ? 1.8 : 0));
      const back = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
      const target = focus.clone().addScaledVector(back, -5.2).add(new THREE.Vector3(0, 2.6, 0));
      camPos.lerp(target, Math.min(1, dt * 4));
      camLook.lerp(focus.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(back, 2), Math.min(1, dt * 6));
      camera.fov += (62 - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
    // Keep the camera out of buildings: walk it back toward the focus until it is clear.
    const inside = (x: number, z: number) => world.solids.some((b) => x > b.minX - 0.4 && x < b.maxX + 0.4 && z > b.minZ - 0.4 && z < b.maxZ + 0.4);
    const camFinal = camPos.clone();
    if (camMode !== 2 || !player.inCar) {
      for (let k = 0; k < 10 && inside(camFinal.x, camFinal.z); k++) camFinal.lerp(new THREE.Vector3(focus.x, camFinal.y, focus.z), 0.2);
    }
    camera.position.copy(camFinal);
    camera.lookAt(camLook);
    // Handheld sway.
    camera.rotation.z += Math.sin(t * 0.7) * 0.004;

    // Sky, sun and time of day.
    const atm = skyDome.update(dt, focus, fog, renderer);
    lastAtmWarm = atm.warmth;
    const nightK = atm.night;
    if (Math.abs(nightK - lastNight) > 0.02) {
      lastNight = nightK;
      world.setNight(nightK);
      const lightsOn = nightK > 0.3 || atm.elevation < 4;
      if (lightsOn !== carLights) {
        carLights = lightsOn;
        for (const c of allCars) if (!traffic.police.some((p) => p.car === c)) c.setLights(lightsOn);
      }
      for (const l of lampPool) l.intensity = 16 * nightK;
    }
    const near = [...world.lamps].sort((a, b) => (a.x - focus.x) ** 2 + (a.z - focus.z) ** 2 - ((b.x - focus.x) ** 2 + (b.z - focus.z) ** 2)).slice(0, lampPool.length);
    near.forEach((l, i) => lampPool[i].position.set(l.x, 6.3, l.z));
    rain.visible = nightK > 0.6;
    // Rain follows the camera.
    rain.position.set(camPos.x, 0, camPos.z);
    const rp = rainGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < rainCount; i++) {
      let y = rp.getY(i * 2) - dt * 30;
      if (y < 0) y += 40;
      rp.setY(i * 2, y);
      rp.setY(i * 2 + 1, y + 0.9);
    }
    rp.needsUpdate = true;

    world.update(t, dt);
    hud.setCash(missions.cash);
    hud.setSpeed(pc.kmh, !!player.inCar);
    const m = missions.current;
    hud.setMission(m ? m.title : null, m ? m.detail : '', m ? m.timeLeft : 0, m ? m.total : 1);
    mapAcc += dt;
    if (mapAcc > 0.08) {
      mapAcc = 0;
      const tgt = missions.target;
      hud.drawMap(focus.x, focus.z, player.inCar ? pc.heading : camYaw, tgt ? { x: tgt.x, z: tgt.z } : null, traffic.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })), world.roadsX, world.roadsZ);
    }
    post.update(t, player.inCar ? Math.min(1, pc.kmh / 165) : 0, lastAtmWarm);
  };
  const loop = () => {
    requestAnimationFrame(loop);
    tick(Math.min(0.05, clock.getDelta()));
    post.render();
  };
  loop();
  // Deterministic hook for tests: advance the simulation by N seconds at 60 Hz, then draw one frame.
  (window as any).__neoncity = {
    renderer,
    start,
    advance(seconds: number) {
      const steps = Math.round(seconds * 60);
      for (let i = 0; i < steps; i++) tick(1 / 60);
      post.render();
    },
    debugWanted(n: number) {
      wanted = n;
    },
    state: () => ({ inCar: !!player.inCar, kmh: playerCar.kmh, cash: missions.cash, mission: missions.current?.title ?? null, pos: [player.pos.x, player.pos.z], carPos: [playerCar.pos.x, playerCar.pos.z], completed: missions.completed, wanted, police: traffic.police.length }),
  };
}

boot().catch((err) => {
  console.error(err);
  const intro = document.getElementById('intro');
  if (intro) intro.innerHTML = '<h1>NEON CITY</h1><p>Your browser could not start WebGL. Try a recent Chrome, Safari or Firefox.</p>';
});
