import {
  BigCoords,
  CharacterMapInfo,
  Direction,
  EquipmentMapInfo,
  Gender,
} from 'eolib';
import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  CREATE_CHARACTER_PREVIEW_PLAYER_ID,
  MAX_HAIR_COLOR,
  MAX_HAIR_STYLE,
  MAX_SKIN,
  MIN_HAIR_COLOR,
  MIN_HAIR_STYLE,
  MIN_SKIN,
} from '@/consts';
import { GameState } from '@/game-state';
import {
  Button,
  CharacterPreview,
  CycleInput,
  drawCharacterPreview,
  Input,
} from '@/ui/components';
import { useClient, useLocale } from '@/ui/context';

const MIN_GENDER = Gender.Female;
const MAX_GENDER = Gender.Male;
const DIRECTION_COUNT = 4;

function makeFakeCharacter(
  gender: Gender,
  hairStyle: number,
  hairColor: number,
  skin: number,
  direction: Direction,
): CharacterMapInfo {
  const info = new CharacterMapInfo();
  info.playerId = CREATE_CHARACTER_PREVIEW_PLAYER_ID;
  info.name = '';
  info.coords = new BigCoords();
  info.direction = direction;
  info.gender = gender;
  info.hairStyle = hairStyle;
  info.hairColor = hairColor;
  info.skin = skin;
  info.equipment = new EquipmentMapInfo();
  return info;
}

export function CreateCharacter() {
  const client = useClient();
  const { locale } = useLocale();

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>(Gender.Female);
  const [hairStyle, setHairStyle] = useState(MIN_HAIR_STYLE);
  const [hairColor, setHairColor] = useState(MIN_HAIR_COLOR);
  const [skin, setSkin] = useState(MIN_SKIN);
  const [classId, setClassId] = useState(1);

  // client.ecf.classes ends with an "eof" sentinel record (server appends it),
  // so the number of selectable classes is length - 1. Falls back to 1 until
  // the ECF arrives (pushed right after login, before this screen).
  const classCount = Math.max(1, (client.ecf?.classes.length ?? 2) - 1);
  const classRecord = client.getEcfRecordById(classId);
  const [direction, setDirection] = useState<Direction>(Direction.Down);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(() =>
    drawCharacterPreview(
      client,
      CREATE_CHARACTER_PREVIEW_PLAYER_ID,
      Direction.Down,
    ),
  );

  useEffect(() => {
    const existing = client.nearby.characters.findIndex(
      (c) => c.playerId === CREATE_CHARACTER_PREVIEW_PLAYER_ID,
    );
    const fakeChar = makeFakeCharacter(
      gender,
      hairStyle,
      hairColor,
      skin,
      direction,
    );

    if (existing >= 0) {
      client.nearby.characters[existing] = fakeChar;
    } else {
      client.nearby.characters.push(fakeChar);
    }

    client.atlas.refreshAsync().then(() => {
      setPreviewUrl(
        drawCharacterPreview(
          client,
          CREATE_CHARACTER_PREVIEW_PLAYER_ID,
          direction,
        ),
      );
    });
  }, [client, gender, hairStyle, hairColor, skin, direction]);

  const onSubmit = useCallback(
    (e: SubmitEvent) => {
      e.preventDefault();
      client.authenticationController.requestCharacterCreation({
        name,
        gender,
        hairStyle,
        hairColor,
        skin,
        classId,
      });
    },
    [client, name, gender, hairStyle, hairColor, skin, classId],
  );

  const cancel = useCallback(() => {
    client.setState(GameState.CharacterSelect);
  }, [client]);

  const rotatePreview = useCallback(() => {
    setDirection((d) => ((d + 1) % DIRECTION_COUNT) as Direction);
  }, []);

  const formatGender = useCallback(
    (value: number) =>
      value === Gender.Female
        ? locale.createCharacter.female
        : locale.createCharacter.male,
    [locale],
  );

  const formatOneBased = useCallback((value: number) => String(value + 1), []);

  const formatClassName = useCallback(
    (value: number) => client.getEcfRecordById(value)?.name ?? `Class ${value}`,
    [client],
  );

  const classBonuses = useCallback(
    (record = classRecord) => {
      if (!record) return '';
      const parts: string[] = [];
      if (record.str) parts.push(`STR +${record.str}`);
      if (record.intl) parts.push(`INT +${record.intl}`);
      if (record.wis) parts.push(`WIS +${record.wis}`);
      if (record.agi) parts.push(`AGI +${record.agi}`);
      if (record.con) parts.push(`CON +${record.con}`);
      if (record.cha) parts.push(`CHA +${record.cha}`);
      return parts.join(' · ');
    },
    [classRecord],
  );

  return (
    <div class='card bg-base-100 shadow-sm'>
      <div class='card-body'>
        <div class='card-title'>{locale.createCharacter.title}</div>
        <div class='flex gap-4'>
          <button
            type='button'
            class='flex shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0'
            onClick={rotatePreview}
          >
            <CharacterPreview previewUrl={previewUrl} alt='preview' />
          </button>
          <form onSubmit={onSubmit} class='flex min-w-0 flex-1 flex-col gap-3'>
            <Input
              label={locale.createCharacter.name}
              name='name'
              value={name}
              onChange={setName}
              autofocus
            />
            <CycleInput
              label={locale.createCharacter.gender}
              value={gender}
              min={MIN_GENDER}
              max={MAX_GENDER}
              format={formatGender}
              onChange={(v) => setGender(v as Gender)}
            />
            <CycleInput
              label={locale.createCharacter.hairStyle}
              value={hairStyle}
              min={MIN_HAIR_STYLE}
              max={MAX_HAIR_STYLE}
              onChange={setHairStyle}
            />
            <CycleInput
              label={locale.createCharacter.hairColor}
              value={hairColor}
              min={MIN_HAIR_COLOR}
              max={MAX_HAIR_COLOR - 1}
              format={formatOneBased}
              onChange={setHairColor}
            />
            <CycleInput
              label={locale.createCharacter.skin}
              value={skin}
              min={MIN_SKIN}
              max={MAX_SKIN - 1}
              format={formatOneBased}
              onChange={setSkin}
            />
            <CycleInput
              label={locale.createCharacter.class}
              value={classId}
              min={1}
              max={classCount}
              format={formatClassName}
              onChange={setClassId}
            />
            <div class='text-xs opacity-70'>{classBonuses() || ' '}</div>
            <div class='text-warning text-xs'>
              {locale.createCharacter.classWarning}
            </div>
            <div class='card-actions'>
              <Button type='submit' variant='primary'>
                {locale.createCharacter.btn}
              </Button>
              <Button variant='ghost' onClick={cancel}>
                {locale.shared.btnCancel}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
