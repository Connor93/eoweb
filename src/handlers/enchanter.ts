import { type EoReader, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';
import { SfxId } from '@/sfx';

/**
 * REOSERV custom packet family — not in upstream eolib. See
 * `src/controllers/enchanter-controller.ts` for the full wire-format note.
 */
const FAMILY_ENCHANTER = 61;

function handleEnchanterOpen(client: Client, reader: EoReader) {
  const sessionId = reader.getShort();
  const rarityMultX100 = [
    reader.getInt(),
    reader.getInt(),
    reader.getInt(),
    reader.getInt(),
  ];
  const baseX100 = [
    reader.getInt(),
    reader.getInt(),
    reader.getInt(),
    reader.getInt(),
  ];
  client.enchanterController.handleOpened(sessionId, {
    rarityMultX100,
    baseX100,
  });
}

function handleEnchanterResult(client: Client, reader: EoReader) {
  const status = reader.getChar();
  client.enchanterController.handleResult(status);
  if (status === 0) {
    client.audioController.playById(SfxId.Craft);
    client.toastController.showSuccess(client.locale.enchanter.resultOk);
  } else if (status === 1) {
    client.toastController.showError(
      client.locale.enchanter.resultInsufficient,
    );
  } else {
    client.toastController.showError(client.locale.enchanter.resultInvalid);
  }
}

export function registerEnchanterHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    FAMILY_ENCHANTER as PacketFamily,
    PacketAction.Open,
    (reader) => handleEnchanterOpen(client, reader),
  );
  client.bus!.registerPacketHandler(
    FAMILY_ENCHANTER as PacketFamily,
    PacketAction.Reply,
    (reader) => handleEnchanterResult(client, reader),
  );
}
