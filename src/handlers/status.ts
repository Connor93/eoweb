import { type EoReader, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
import type { StatusEntryWire } from '@/controllers';

const FAMILY_STATUS = 63;

function readStr(reader: EoReader): string {
  const len = reader.getChar();
  return new TextDecoder().decode(new Uint8Array(reader.getBytes(len)));
}

function readEntry(reader: EoReader): StatusEntryWire {
  return {
    statusId: readStr(reader),
    name: readStr(reader),
    iconId: readStr(reader),
    isDebuff: reader.getChar() !== 0,
    showTimer: reader.getChar() !== 0,
    permanent: reader.getChar() !== 0,
    stacks: reader.getChar(),
    durationMs: reader.getInt(),
    remainingMs: reader.getInt(),
  };
}

function handleSync(client: Client, reader: EoReader): void {
  const entityId = reader.getShort();
  reader.getChar(); // entity_kind (only Player now)
  const count = reader.getChar();
  const entries: StatusEntryWire[] = [];
  for (let i = 0; i < count; i++) entries.push(readEntry(reader));
  client.statusController.sync(entityId, entries);
}

function handleAdd(client: Client, reader: EoReader): void {
  const entityId = reader.getShort();
  reader.getChar(); // entity_kind
  client.statusController.add(entityId, readEntry(reader));
}

function handleRemove(client: Client, reader: EoReader): void {
  const entityId = reader.getShort();
  reader.getChar(); // entity_kind
  const statusId = readStr(reader);
  client.statusController.remove(entityId, statusId);
}

export function registerStatusHandlers(client: Client): void {
  client.bus!.registerPacketHandler(
    FAMILY_STATUS as PacketFamily,
    PacketAction.List,
    (reader) => handleSync(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_STATUS as PacketFamily,
    PacketAction.Add,
    (reader) => handleAdd(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_STATUS as PacketFamily,
    PacketAction.Remove,
    (reader) => handleRemove(client, reader),
  );
}
