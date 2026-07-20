import {
  AdminLevel,
  CharacterBaseStats,
  type CharacterMapInfo,
  CharacterSecondaryStats,
  type Ecf,
  type EcfRecord,
  type Eif,
  type EifRecord,
  type Emf,
  type Enf,
  type EnfRecord,
  EquipmentPaperdoll,
  type Esf,
  type EsfRecord,
  type FileType,
  InitInitClientPacket,
  type ItemMapInfo,
  MapType,
  NearbyInfo,
  type NpcKilledData,
  type NpcMapInfo,
  type NpcType,
  type OnlinePlayer,
  RefreshRequestClientPacket,
  type ServerSettings,
  type Spell,
  Version,
  Weight,
} from 'eolib';
import { Application, Container } from 'pixi.js';
import { Atlas } from '@/atlas';
import { PacketBus } from '@/bus';
import { clearRectangles } from '@/collision';
import { getDefaultConfig, loadConfig } from '@/config';
import { HALF_TILE_HEIGHT, INITIAL_IDLE_TICKS, MAX_CHALLENGE } from '@/consts';
import {
  AlertController,
  AnimationController,
  AudioController,
  AuthenticationController,
  BankController,
  BarberController,
  BardController,
  BoardController,
  BossController,
  ChatController,
  ChestController,
  CleanupController,
  CombatOverlayController,
  CommandController,
  ConfigController,
  DrunkController,
  EnchanterController,
  GuildController,
  HotbarController,
  InnController,
  InstanceController,
  InventoryController,
  ItemProtectionController,
  JukeboxController,
  KeyboardController,
  LockerController,
  LookupController,
  MapController,
  MarriageController,
  MouseController,
  MovementController,
  NpcController,
  NpcElementController,
  PartyController,
  PingController,
  QuakeController,
  QuestController,
  ReputationController,
  SalvageController,
  type SavedSession,
  SessionController,
  ShopController,
  SkillController,
  SocialController,
  SpellController,
  StatSkillController,
  StatsController,
  StatusController,
  ToastController,
  TradeController,
  UsageController,
  ViewportController,
  WeaponElementController,
} from '@/controllers';
import { getEcf, getEdf, getEif, getEmf, getEnf, getEsf } from '@/db';
import { DialogResourceID, type Edf, EOResourceID } from '@/edf';
import { Sans11Font } from '@/fonts';
import { GameState } from '@/game-state';
import { GfxLoader } from '@/gfx';
import { registerAllHandlers } from '@/handlers';
import { defaultLocale, formatLocaleString, locales } from '@/locale';
import { MapRenderer } from '@/map';
import { MinimapRenderer } from '@/minimap';
import { PacketLogStore } from '@/packet-log';
import { CharacterDeathAnimation, NpcDeathAnimation } from '@/render';
import { SfxId, setAudioController } from '@/sfx';
import type { ISlot } from '@/ui/enums';
import type {
  EffectMetadata,
  NPCMetadata,
  ShieldMetadata,
  WeaponMetadata,
} from '@/utils';
import {
  capitalize,
  EffectAnimationType,
  getEffectMetaData,
  getHatMetadata,
  getNpcMetaData,
  getShieldMetaData,
  getWeaponMetaData,
  HatMaskType,
  isoToScreen,
  randomRange,
  screenToIso,
} from '@/utils';
import type { Vector2 } from '@/vector';

export class Client {
  private stateChangedSubscribers: ((state: GameState) => void)[] = [];
  container!: HTMLDivElement;
  app!: Application;
  worldContainer!: Container;
  uiContainer!: Container;
  minimapContainer!: Container;
  width = 800;
  height = 600;
  zoom = 1;
  tickCount = 0;
  bus = new PacketBus();
  packetLogStore = new PacketLogStore();
  config = getDefaultConfig();
  version: Version;
  challenge: number;
  hdid = String(Math.floor(Math.random() * 2147483647));
  playerId = 0;
  characterId = 0;
  name = '';
  title = '';
  home = '';
  partner = '';
  guildName = '';
  guildTag = '';
  guildRank = 0;
  guildRankName = '';
  classId = 0;
  admin = AdminLevel.Player;
  level = 0;
  experience = 0;
  hp = 0;
  maxHp = 0;
  tp = 0;
  maxTp = 0;
  maxSp = 0;
  statPoints = 0;
  skillPoints = 0;
  karma = 0;
  baseStats = new CharacterBaseStats();
  secondaryStats = new CharacterSecondaryStats();
  equipment = new EquipmentPaperdoll();
  spells: Spell[] = [];
  weight = new Weight();
  mapId = 5;
  warpMapId = 0;
  warpQueued = false;
  state = GameState.Initial;
  postConnectState?: GameState;
  sessionId = 0;
  serverSettings: ServerSettings | null = null;
  motd = '';
  nearby: NearbyInfo;
  // Live per-player action rates from the server (PlayerRates deep packet,
  // family 55). Missing entry = server defaults (attack 600ms / walk 480ms).
  playerRates: Map<
    number,
    {
      attackMs: number;
      moveMs: number;
      attackCapped: boolean;
      moveCapped: boolean;
    }
  > = new Map();
  // Authored weapon swing speeds (item_id -> ms), from the family-55 Reply
  // packet. Sparse: only items that author attack_rate_ms appear.
  itemAttackRates: Map<number, number> = new Map();
  // Effective weapon attack range in tiles (item_id -> tiles), from the same
  // family-55 Reply packet. Sparse: only weapons whose reach exceeds 1 appear.
  itemAttackRanges: Map<number, number> = new Map();
  // Class ids selectable at character creation (CreationConfig deep packet,
  // family 57). null = not yet received → the create screen falls back to all
  // ECF classes. Pushed after login and on pub reload.
  playableClasses: number[] | null = null;
  // Whether the server is accepting new-account creation (AccountConfig deep
  // packet, Account + ACTION_CONFIG). Default true = fail-open: if the packet
  // never arrives we leave the "Create Account" button enabled. Pushed at
  // connection-accept, pre-login.
  registrationEnabled = true;
  private registrationSubscribers: (() => void)[] = [];
  // uid of the ground item under the mouse cursor, or null. Drives the
  // ground-item hover tooltip; resolved on mousemove (tile-based, same
  // filter clickItem uses).
  hoveredItemUid: number | null = null;
  // NPC index (instance index, matches getNpcByIndex) currently under the
  // cursor — drives the <NpcTooltip> overlay. Null when no NPC is hovered.
  hoveredNpcIndex: number | null = null;
  // Player id (matches getCharacterById) currently under the cursor — drives
  // the <PlayerTooltip> overlay. Null when no player is hovered.
  hoveredCharacterId: number | null = null;

  /** Clear all hover-tooltip state (ground item, NPC, player). */
  clearHoverState(): void {
    this.hoveredItemUid = null;
    this.hoveredNpcIndex = null;
    this.hoveredCharacterId = null;
  }

  eif!: Eif;
  ecf!: Ecf;
  enf!: Enf;
  esf!: Esf;
  map!: Emf;
  mapRenderer: MapRenderer;
  downloadQueue: { type: FileType; id: number }[] = [];
  // True only while the Welcome file-download sequence is in progress. Lets
  // the FileEcf handler tell a real download apart from the post-login ECF
  // push (which must NOT advance into the game).
  awaitingGameFiles = false;
  mousePosition: Vector2 | undefined;
  mouseCoords: Vector2 | undefined;
  viewportController: ViewportController;
  animationController: AnimationController;
  movementController: MovementController;
  keyboardController: KeyboardController;
  audioController: AudioController;
  authenticationController: AuthenticationController;
  bankController: BankController;
  bardController: BardController;
  barberController: BarberController;
  boardController: BoardController;
  bossController: BossController;
  chatController: ChatController;
  chestController: ChestController;
  cleanupController: CleanupController;
  combatOverlayController: CombatOverlayController;
  drunkController: DrunkController;
  jukeboxController: JukeboxController;
  commandController: CommandController;
  instanceController: InstanceController;
  weaponElementController: WeaponElementController;
  inventoryController: InventoryController;
  lockerController: LockerController;
  lookupController: LookupController;
  mapController: MapController;
  mouseController: MouseController;
  npcController: NpcController;
  npcElementController: NpcElementController;
  questController: QuestController;
  reputationController: ReputationController;
  salvageController: SalvageController;
  enchanterController: EnchanterController;
  sessionController: SessionController;
  shopController: ShopController;
  skillController: SkillController;
  statusController: StatusController;
  socialController: SocialController;
  statSkillController: StatSkillController;
  statsController: StatsController;
  itemProtectionController: ItemProtectionController;
  quakeController: QuakeController;
  spellController: SpellController;
  usageController: UsageController;
  tradeController: TradeController;
  guildController: GuildController;
  hotbarController: HotbarController;
  innController: InnController;
  alertController: AlertController;
  toastController: ToastController;
  partyController: PartyController;
  marriageController: MarriageController;
  pingController: PingController;
  npcMetadata = getNpcMetaData();
  weaponMetadata: Map<number, WeaponMetadata> = new Map();
  shieldMetadata = getShieldMetaData();
  effectMetadata = getEffectMetaData();
  hatMetadata = getHatMetadata();
  typing = false;
  reconnecting = false;
  edfs: {
    game1: Edf | null;
    game2: Edf | null;
    jukebox: Edf | null;
  } = {
    game1: null,
    game2: null,
    jukebox: null,
  };
  atlas: Atlas;
  gfxLoader = new GfxLoader();
  hotbarSlots: ISlot[] = [];
  sans11: Sans11Font;
  menuPlayerId = 0;
  minimapEnabled = false;
  minimapRenderer: MinimapRenderer;
  onlinePlayers: OnlinePlayer[] = [];
  playerTriggeredDisconnect = false;
  reconnectAttempts = 0;
  maxReconnectAttempts = 3;
  reconnectTimer?: number;
  locale = locales[defaultLocale];
  configController = new ConfigController();
  // Persistent Sets reused each tick to avoid per-tick allocation
  private readonly _activeCharIds = new Set<number>();
  private readonly _activeNpcIds = new Set<number>();

  constructor() {
    registerAllHandlers(this);
    this.bus.onPacketSent = (family, action, rawBytes, payload) => {
      this.packetLogStore.addEntry({
        source: 'client',
        family,
        action,
        timestamp: new Date(),
        rawBytes,
        payload,
      });
    };
    this.bus.onPacketReceived = (family, action, rawBytes, payload) => {
      this.packetLogStore.addEntry({
        source: 'server',
        family,
        action,
        timestamp: new Date(),
        rawBytes,
        payload,
      });
    };
    this.container = document.querySelector('#game-container')!;
    this.version = new Version();
    this.version.major = 1;
    this.version.minor = 0;
    this.version.patch = 0;
    this.challenge = 0;
    getEif().then(async (eif) => {
      this.eif = eif!;
      if (eif) {
        this.weaponMetadata = getWeaponMetaData();
      }
    });
    getEcf().then((ecf) => {
      this.ecf = ecf!;
    });
    getEnf().then((enf) => {
      this.enf = enf!;
    });
    getEsf().then((esf) => {
      this.esf = esf!;
    });
    getEdf(3).then((edf) => {
      this.socialController.naughtyWords =
        edf
          ?.getLine(0)
          ?.split(':')
          .filter((word) => word.length > 0) || [];
    });
    getEdf(4).then((edf) => {
      this.edfs.jukebox = edf;
      this.jukeboxController.loadTracks();
    });
    getEdf(5).then((edf) => {
      this.edfs.game1 = edf;
    });
    getEdf(6).then((edf) => {
      this.edfs.game2 = edf;
    });
    this.nearby = new NearbyInfo();
    this.nearby.characters = [];
    this.nearby.npcs = [];
    this.nearby.items = [];
    this.mapRenderer = new MapRenderer(this);
    this.minimapRenderer = new MinimapRenderer(this);
    this.viewportController = new ViewportController(this);
    this.animationController = new AnimationController(this);
    this.movementController = new MovementController(this);
    this.keyboardController = new KeyboardController(this);
    this.audioController = new AudioController(this);
    setAudioController(this.audioController);
    this.authenticationController = new AuthenticationController(this);
    this.bankController = new BankController(this);
    this.bardController = new BardController(this);
    this.barberController = new BarberController(this);
    this.boardController = new BoardController(this);
    this.bossController = new BossController(this);
    this.chatController = new ChatController(this);
    this.chestController = new ChestController(this);
    this.cleanupController = new CleanupController(this);
    this.combatOverlayController = new CombatOverlayController();
    this.commandController = new CommandController(this);
    this.drunkController = new DrunkController(this);
    this.instanceController = new InstanceController(this);
    this.weaponElementController = new WeaponElementController(this);
    this.inventoryController = new InventoryController(this);
    this.itemProtectionController = new ItemProtectionController();
    this.alertController = new AlertController();
    this.lockerController = new LockerController(this);
    this.lookupController = new LookupController(this);
    this.mapController = new MapController(this);
    this.mouseController = new MouseController(this);
    this.npcController = new NpcController(this);
    this.npcElementController = new NpcElementController(this);
    this.questController = new QuestController(this);
    this.quakeController = new QuakeController();
    this.reputationController = new ReputationController(this);
    this.salvageController = new SalvageController(this);
    this.enchanterController = new EnchanterController(this);
    this.sessionController = new SessionController(this);
    this.shopController = new ShopController(this);
    this.skillController = new SkillController(this);
    this.statusController = new StatusController(this);
    this.socialController = new SocialController(this);
    this.spellController = new SpellController(this);
    this.statSkillController = new StatSkillController(this);
    this.statsController = new StatsController();
    this.usageController = new UsageController(this);
    this.tradeController = new TradeController(this);
    this.guildController = new GuildController(this);
    this.hotbarController = new HotbarController(this);
    this.innController = new InnController(this);
    this.marriageController = new MarriageController(this);
    this.partyController = new PartyController(this);
    this.toastController = new ToastController();
    this.jukeboxController = new JukeboxController(this);
    this.pingController = new PingController(this);
    loadConfig().then((config) => {
      this.config = config;
      const txtHost =
        document.querySelector<HTMLInputElement>('input[name="host"]')!;

      if (txtHost) {
        if (this.config.staticHost) {
          txtHost!.classList.add('hidden');
        }
        txtHost!.value = config.host;
      }

      document.title = config.title;
    });
    this.atlas = new Atlas(this);
    this.sans11 = new Sans11Font(this.atlas);
  }

  async initPixi() {
    this.app = new Application();
    await this.app.init({
      width: this.viewportController.getGameWidth(),
      height: this.viewportController.getGameHeight(),
      background: '#000000',
      antialias: false,
    });

    this.app.renderer.canvas.id = 'game';
    this.app.renderer.canvas.style.imageRendering = 'pixelated';

    const gameEl = document.querySelector('#game');
    if (gameEl) {
      gameEl.replaceWith(this.app.renderer.canvas);
    } else {
      document
        .querySelector('#game-container')!
        .appendChild(this.app.renderer.canvas);
    }

    this.worldContainer = new Container();
    this.uiContainer = new Container();
    this.minimapContainer = new Container();

    this.app.stage.addChild(this.worldContainer);
    this.app.stage.addChild(this.uiContainer);
    this.app.stage.addChild(this.minimapContainer);

    // Sync CSS size now that the canvas is in the DOM
    this.viewportController.resizeCanvases();
  }

  getCharacterById(id: number): CharacterMapInfo | undefined {
    return this.nearby.characters.find((c) => c.playerId === id);
  }

  getPlayerRates(playerId: number): {
    attackMs: number;
    moveMs: number;
    attackCapped: boolean;
    moveCapped: boolean;
  } {
    return (
      this.playerRates.get(playerId) ?? {
        attackMs: 600,
        moveMs: 480,
        attackCapped: false,
        moveCapped: false,
      }
    );
  }

  getPlayerCharacter(): CharacterMapInfo | undefined {
    return this.nearby.characters.find((c) => c.playerId === this.playerId);
  }

  getNpcByIndex(index: number): NpcMapInfo | undefined {
    return this.nearby.npcs.find((n) => n.index === index);
  }

  getItemByIndex(index: number): ItemMapInfo | undefined {
    return this.nearby.items.find((i) => i.uid === index);
  }

  getNpcMetadata(graphicId: number): NPCMetadata {
    const data = this.npcMetadata.get(graphicId);
    if (data) {
      return data;
    }

    return {
      xOffset: 0,
      yOffset: 0,
      xOffsetAttack: 0,
      yOffsetAttack: 0,
      animatedStanding: false,
      nameLabelOffset: 0,
      transparent: false,
    };
  }

  getEnfRecordById(id: number): EnfRecord | undefined {
    if (!this.enf) {
      return;
    }

    return this.enf.npcs[id - 1];
  }

  getEnfRecordByBehaviorId(
    type: NpcType,
    behaviorId: number,
  ): EnfRecord | undefined {
    if (!this.enf) {
      return;
    }

    return this.enf.npcs.find(
      (n) => n.type === type && n.behaviorId === behaviorId,
    );
  }

  getWeaponMetadata(graphicId: number): WeaponMetadata {
    // Check the live module-level map (populated by async load)
    // rather than only the snapshot, to avoid timing issues
    const live = getWeaponMetaData();
    const data = live.get(graphicId) || this.weaponMetadata.get(graphicId);
    if (data) {
      return data;
    }

    return { slash: 0, sfx: [SfxId.MeleeWeaponAttack], ranged: false };
  }

  getShieldMetadata(graphicId: number): ShieldMetadata {
    const data = this.shieldMetadata.get(graphicId);
    if (data) {
      return data;
    }

    return { back: false };
  }

  getHatMetadata(graphicId: number): HatMaskType {
    const data = this.hatMetadata.get(graphicId);
    if (data) {
      return data;
    }

    return HatMaskType.Standard;
  }

  getEifRecordById(id: number): EifRecord | undefined {
    if (!this.eif) {
      return;
    }

    return this.eif.items[id - 1];
  }

  getEcfRecordById(id: number): EcfRecord | undefined {
    if (!this.ecf) {
      return;
    }

    return this.ecf.classes[id - 1];
  }

  getEsfRecordById(id: number): EsfRecord | undefined {
    if (!this.esf) {
      return;
    }

    return this.esf.skills[id - 1];
  }

  getResourceString(id: EOResourceID): string {
    const edf = this.edfs.game2;
    if (!edf) {
      return '';
    }

    const line = edf.getLine(id);
    if (!line) {
      return '';
    }

    if (line.startsWith('*')) {
      return line.substring(1);
    }

    return line;
  }

  getDialogStrings(id: DialogResourceID): string[] {
    const edf = this.edfs.game1;
    if (!edf) {
      return ['', ''];
    }

    return [edf.getLine(id) ?? '', edf.getLine(id + 1) ?? ''];
  }

  getEffectMetadata(graphicId: number): EffectMetadata {
    const data = this.effectMetadata.get(graphicId);
    if (data) {
      return data;
    }

    return {
      hasBehindLayer: false,
      hasTransparentLayer: false,
      hasInFrontLayer: true,
      sfx: 0,
      frames: 4,
      loops: 2,
      offsetX: 0,
      offsetY: 0,
      animationType: EffectAnimationType.Static,
      verticalMetadata: null,
      positionOffsetMetadata: null,
      randomFlickeringMetadata: null,
    };
  }

  getPlayerCoords() {
    const playerCharacter = this.getPlayerCharacter();
    if (playerCharacter) {
      return { x: playerCharacter.coords.x, y: playerCharacter.coords.y };
    }

    return { x: 0, y: 0 };
  }

  setMousePosition(position: Vector2) {
    this.mousePosition = position;

    const player = this.getPlayerCoords();
    const playerScreen = isoToScreen(player);

    const mouseWorldX =
      position.x - this.viewportController.getHalfGameWidth() + playerScreen.x;
    const mouseWorldY =
      position.y -
      this.viewportController.getHalfGameHeight() +
      playerScreen.y +
      HALF_TILE_HEIGHT;

    this.mouseCoords = screenToIso({ x: mouseWorldX, y: mouseWorldY });

    if (this.mouseCoords.x < 0 || this.mouseCoords.y < 0) {
      this.mouseCoords = undefined;
    }
  }

  tick() {
    this.tickCount += 1;
    this.keyboardController.tick();
    this.mapRenderer.tick();

    if (this.state === GameState.InGame) {
      // Rebuild persistent Sets to avoid per-tick allocation
      this._activeCharIds.clear();
      for (const c of this.nearby.characters)
        this._activeCharIds.add(c.playerId);
      this._activeNpcIds.clear();
      for (const n of this.nearby.npcs) this._activeNpcIds.add(n.index);
      const activeCharIds = this._activeCharIds;
      const activeNpcIds = this._activeNpcIds;

      this.usageController.tick();
      this.itemProtectionController.tick();
      this.drunkController.tick();
      this.cleanupController.tick();
      this.spellController.tick();
      this.skillController.tick();
      this.statusController.tick();
      this.npcController.tick();
      this.pingController.tick();

      const { playerWalking, playerDying } = this.animationController.tick(
        activeCharIds,
        activeNpcIds,
      );

      this.mapController.tick();

      if (this.warpQueued && !playerWalking && !playerDying) {
        this.sessionController.acceptWarp();
      }

      this.movementController.tick();
      this.quakeController.tick();
    }
  }

  render(interpolation: number) {
    this.mapRenderer.update(interpolation);
    this.minimapRenderer.update(interpolation);
  }

  // Called once per render frame, AFTER client.render(), so that finishing
  // animations draw their final frame before deletion (advanceTimed) and
  // input dispatched this frame appears next frame (~16ms latency — same
  // order as before, just finer-grained than the old 120ms tick latency).
  // Replaces the direct animationController.advanceTimed call in main.tsx.
  frameUpdate(deltaMs: number) {
    // advanceTimed MUST come before update() so a just-finished animation
    // is deleted before update() reads the animation slot — otherwise the
    // finishing frame would block the next walk/attack for one extra frame.
    this.animationController.advanceTimed(deltaMs);
    this.keyboardController.update(performance.now());
  }

  setMap(map: Emf) {
    if (
      this.map &&
      (this.map.rid[0] !== map.rid[0] ||
        this.map.rid[1] !== map.rid[1] ||
        this.map.byteSize !== map.byteSize)
    ) {
      this.atlas.reset();
      this.atlas.mapId = -1;
    }

    this.map = map;
    this.animationController.characterChats.clear();
    this.animationController.npcChats.clear();
    this.itemProtectionController.itemProtectionTimers.clear();
    this.jukeboxController.reset();
    if (this.map) {
      clearRectangles();
      this.mapRenderer.buildCaches();
      this.mapController.loadDoors();

      if (this.map.type === MapType.Pk) {
        this.audioController.playById(SfxId.EnterPkMap);
      }

      this.audioController.stopAmbientSound();

      if (this.map.ambientSoundId) {
        this.audioController.startAmbientSound();
      }

      this.audioController.updateListenerPosition(this.getPlayerCoords());
      this.audioController.handleMapMusic(
        this.map.musicId,
        this.map.musicControl,
      );

      if (!this.map.mapAvailable) {
        this.minimapEnabled = false;
      }
    }
  }

  async loadMap(id: number): Promise<void> {
    const map = await getEmf(id);
    if (map) {
      this.setMap(map);
    }
  }

  showError(message: string, title = '') {
    this.alertController.show(title, message);
  }

  subscribeStateChanged(cb: (state: GameState) => void): void {
    this.stateChangedSubscribers.push(cb);
  }

  unsubscribeStateChanged(cb: (state: GameState) => void): void {
    this.stateChangedSubscribers = this.stateChangedSubscribers.filter(
      (s) => s !== cb,
    );
  }

  subscribeRegistrationChanged(cb: () => void): void {
    this.registrationSubscribers.push(cb);
  }

  unsubscribeRegistrationChanged(cb: () => void): void {
    this.registrationSubscribers = this.registrationSubscribers.filter(
      (s) => s !== cb,
    );
  }

  setRegistrationEnabled(enabled: boolean): void {
    if (this.registrationEnabled === enabled) return;
    this.registrationEnabled = enabled;
    for (const cb of this.registrationSubscribers) cb();
  }

  // Open the socket while sitting on the main menu so the server can push
  // pre-login config (e.g. whether account creation is open). Lands at
  // GameState.Connected, which still renders MainMenu, so the menu stays put.
  // Fail-open and silent: a failed connect leaves us at Initial with the
  // button enabled — no error popup, that surfaces when the user actually
  // tries to log in.
  ensureConnected(): void {
    if (this.state !== GameState.Initial || this.bus.hasSocket()) return;
    this.postConnectState = undefined;
    this.bus
      .connect(this.config.host, () => this.handleConnectionClose())
      .then(() => {
        this.beginHandshake();
      })
      .catch(() => {
        this.postConnectState = undefined;
      });
  }

  setState(state: GameState) {
    this.state = state;

    if (state === GameState.InGame && this.reconnecting) {
      this.reconnecting = false;
      this.reconnectAttempts = 0;
      this.toastController.showSuccess('Auto-reconnected!');
    }
    this.minimapEnabled = false;
    this.animationController.characterAnimations.clear();
    this.animationController.pendingCharacterAnimations.clear();
    this.animationController.npcAnimations.clear();
    this.animationController.pendingNpcAnimations.clear();
    this.animationController.characterChats.clear();
    this.animationController.npcChats.clear();
    this.npcController.queuedNpcChats.clear();
    this.animationController.characterEmotes.clear();
    this.animationController.effects = [];
    this.movementController.autoWalkPath = [];
    this.spellController.spellTarget = null;
    this.downloadQueue = [];
    this.usageController.idleTicks = INITIAL_IDLE_TICKS;
    this.drunkController.drunk = false;
    this.drunkController.drunkEmoteTicks = 0;
    this.spellController.selectedSpellId = 0;
    this.spellController.queuedSpellId = 0;
    this.spellController.spellCooldownTicks = 0;
    this.menuPlayerId = 0;
    this.onlinePlayers = [];
    this.inventoryController.equipmentSwap = null;
    this.itemProtectionController.itemProtectionTimers.clear();
    if (state === GameState.InGame) {
      this.questController.loadTrackedQuest();
      this.partyController.reset();
    }
    for (const cb of this.stateChangedSubscribers) cb(this.state);
    this.audioController.handleStateChange(state);
  }

  connect(nextState: GameState) {
    this.postConnectState = nextState;
    this.bus
      .connect(this.config.host, () => this.handleConnectionClose())
      .then(() => {
        this.beginHandshake();
      })
      .catch((err) => {
        console.warn('Failed to connect to server', err);
        const strings = this.getDialogStrings(
          DialogResourceID.CONNECTION_SERVER_NOT_FOUND,
        );
        this.alertController.show(strings[0], strings[1]);
        this.postConnectState = undefined;
      });
  }

  private handleConnectionClose() {
    if (this.playerTriggeredDisconnect) {
      this.playerTriggeredDisconnect = false;
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    const session = this.getSavedSessionForCurrentCharacter();
    if (!session) {
      this.reconnecting = false;
      const strings = this.getDialogStrings(
        DialogResourceID.CONNECTION_LOST_CONNECTION,
      );
      this.alertController.show(strings[0], strings[1]);
      this.setState(GameState.Initial);
      return;
    }

    this.attemptReconnect(session);
  }

  private attemptReconnect(session: SavedSession) {
    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.reconnecting = false;
      this.toastController.showError('Auto-reconnect failed after 3 attempts');
      this.setState(GameState.Initial);
      this.authenticationController.clearSession();
      this.reconnectAttempts = 0;
      return;
    }

    this.reconnecting = true;
    this.authenticationController.selectSession(session.username);
    this.postConnectState = GameState.Login;
    this.bus
      .connect(this.config.host, () => this.handleConnectionClose())
      .then(() => {
        this.beginHandshake();
      })
      .catch(() => {
        this.toastController.showWarning(
          `Auto-reconnect failed: Retrying.. Attempt #${this.reconnectAttempts}`,
        );
        this.reconnectTimer = window.setTimeout(() => {
          this.attemptReconnect(session);
        }, 2000);
      });
  }

  private getSavedSessionForCurrentCharacter(): SavedSession | null {
    if (this.characterId === 0) {
      return null;
    }

    const sessions = this.authenticationController.getSessions();
    return sessions.find((s) => s.lastCharacterId === this.characterId) ?? null;
  }

  private beginHandshake() {
    const packet = new InitInitClientPacket();
    packet.challenge = this.challenge = randomRange(1, MAX_CHALLENGE);
    packet.hdid = this.hdid;
    packet.version = this.version;
    this.bus.send(packet);
  }

  disconnect() {
    this.playerTriggeredDisconnect = true;
    this.reconnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.reconnectAttempts = 0;
    this.setState(GameState.Initial);
    this.authenticationController.clearSession();
    if (this.bus) {
      this.bus.disconnect();
    }
  }

  refresh() {
    this.bus.send(new RefreshRequestClientPacket());
  }

  setNpcDeathAnimation(index: number) {
    const npc = this.nearby.npcs.find((n) => n.index === index);
    if (!npc) {
      return;
    }

    const current = this.animationController.npcAnimations.get(index);
    this.animationController.pendingNpcAnimations.set(
      index,
      new NpcDeathAnimation(current),
    );
  }

  setCharacterDeathAnimation(playerId: number) {
    const character = this.getCharacterById(playerId);
    if (!character) {
      return;
    }

    const current = this.animationController.characterAnimations.get(playerId);
    this.animationController.pendingCharacterAnimations.set(
      playerId,
      new CharacterDeathAnimation(current),
    );
  }

  toggleMinimap() {
    if (!this.map.mapAvailable) {
      this.toastController.showWarning(
        this.getResourceString(EOResourceID.STATUS_LABEL_NO_MAP_OF_AREA),
      );
      return;
    }

    this.minimapEnabled = !this.minimapEnabled;
  }

  addItemDrop(item: ItemMapInfo, protectedFor = 0, ownerId = 0) {
    this.nearby.items.push(item);
    if (protectedFor) {
      this.itemProtectionController.itemProtectionTimers.set(item.uid, {
        ticks: protectedFor,
        ownerId,
      });
    }
  }

  getNpcKilledMessage(
    data: NpcKilledData,
    exp = 0,
    levelUp = false,
  ): string | null {
    let killerName: string | undefined;
    if (data.killerId === this.playerId) {
      killerName = this.locale.shared.wordYou;
    } else {
      killerName = this.partyController.members.find(
        (m) => m.playerId === data.killerId,
      )?.name;
    }

    if (!killerName) {
      return null;
    }

    killerName = capitalize(killerName);

    const npc = this.nearby.npcs.find((n) => n.index === data.npcIndex);
    const record = npc ? this.getEnfRecordById(npc.id) : undefined;
    const npcName = record?.name;

    if (!npcName) {
      return null;
    }

    const messages = [
      formatLocaleString(this.locale.messages.killedNpc, {
        killer: killerName,
        npc: npcName,
      }),
    ];

    if (data.killerId === this.playerId && exp > 0) {
      messages.push(
        formatLocaleString(this.locale.messages.gainedExp, {
          exp: exp.toLocaleString(),
        }),
      );
    }

    if (levelUp) {
      messages.push(
        formatLocaleString(this.locale.messages.levelUp, {
          level: this.level.toLocaleString(),
        }),
      );
    }

    if (data.dropId && data.dropAmount) {
      const itemRecord = this.getEifRecordById(data.dropId);
      const itemName = itemRecord?.name ?? this.locale.shared.wordUnknown;
      if (itemName) {
        const amountText =
          data.dropAmount > 1 ? `${data.dropAmount.toLocaleString()} ` : '';
        messages.push(
          formatLocaleString(this.locale.messages.npcDrop, {
            item: `${amountText}${itemName}`,
          }),
        );
      }
    }

    return messages.join(' ');
  }

  getExpShareMessage(exp: number, levelUp = false): string {
    const messages = [
      formatLocaleString(this.locale.messages.expShare, {
        exp: exp.toLocaleString(),
      }),
    ];

    if (levelUp) {
      messages.push(
        formatLocaleString(this.locale.messages.levelUp, {
          level: this.level.toLocaleString(),
        }),
      );
    }

    return messages.join(' ');
  }
}
