import '@fontsource/barlow-condensed/700.css';
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/ui.css';
import { App } from './app';
import { mountHud } from './ui/hud';
import { mountToasts } from './ui/toast';
import { mountFx } from './ui/fx';
import { mountModals } from './ui/modals';
import { mountPanelHost } from './ui/panel';
import { mountTutorial } from './ui/tutorial';
import { detectQuality } from './render/quality';

const app = new App();
(window as any).__neonhq = app; // used by the Playwright suite

const $ = (id: string) => document.getElementById(id)!;

mountHud(app, $('hud'));
mountToasts(app, $('toasts'));
mountFx(app, $('fx'));
mountPanelHost(app, $('panels'));
mountModals(app, $('modals'));
mountTutorial(app, $('modals'));
app.start();

// Stream in the heavy pieces after first paint.
const sceneRoot = $('scene');
const lite = $('scene-lite');

async function bootScene(): Promise<void> {
  const tier = app.state.settings.quality === 'auto' ? await detectQuality() : app.state.settings.quality;
  app.quality = tier;
  const { createScene } = await import('./render/scene');
  const scene = await createScene(sceneRoot, app, tier);
  app.scene = scene;
  lite.classList.add('hidden');
  if (app.isNew || app.state.company === '') app.on('named', () => scene.establishingShot());
  else scene.establishingShot();
}

async function bootAudio(): Promise<void> {
  const { createAudio } = await import('./audio/index');
  const audio = createAudio(app.state.settings);
  app.audio = audio;
  const resume = () => {
    audio.resume();
    window.removeEventListener('pointerdown', resume);
    window.removeEventListener('keydown', resume);
  };
  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', resume);
}

const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 60));
idle(() => {
  void bootScene().catch((err) => {
    console.error('Scene failed to start', err);
    app.emit('toast', { text: 'Graphics could not start on this device. The game still runs.', tone: 'bad' });
  });
  void bootAudio().catch((err) => console.error('Audio failed to start', err));
});
