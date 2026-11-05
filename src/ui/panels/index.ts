import type { PanelModule } from '../panel';
import { teamPanel } from './team';
import { hirePanel } from './hire';
import { buildPanel } from './build';
import { roomPanel } from './room';
import { treasuryPanel } from './treasury';
import { chatPanel } from './chat';
import { settingsPanel } from './settings';

export const PANELS: Record<string, PanelModule> = {
  team: teamPanel,
  hire: hirePanel,
  build: buildPanel,
  room: roomPanel,
  treasury: treasuryPanel,
  chat: chatPanel,
  settings: settingsPanel,
};
