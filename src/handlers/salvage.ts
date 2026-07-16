import { type EoReader, PacketAction, type PacketFamily } from 'eolib';
import type { Client } from '@/client';

/**
 * REOSERV custom packet family — not in upstream eolib. See
 * `src/controllers/salvage-controller.ts` for the full wire-format note.
 */
const FAMILY_SALVAGE = 60;

function handleSalvageReply(client: Client, reader: EoReader) {
  const weapon = reader.getInt();
  const armor = reader.getInt();
  const accessory = reader.getInt();
  const gainedWeapon = reader.getInt();
  const gainedArmor = reader.getInt();
  const gainedAccessory = reader.getInt();

  client.salvageController.setCounts(
    { weapon, armor, accessory },
    { weapon: gainedWeapon, armor: gainedArmor, accessory: gainedAccessory },
  );

  const totalGained = gainedWeapon + gainedArmor + gainedAccessory;
  if (totalGained > 0) {
    const msg = client.locale.inventory.salvageToast
      .replace('{weapon}', String(gainedWeapon))
      .replace('{armor}', String(gainedArmor))
      .replace('{accessory}', String(gainedAccessory));
    client.toastController.showSuccess(msg);
  }
}

export function registerSalvageHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    FAMILY_SALVAGE as PacketFamily,
    PacketAction.Reply,
    (reader) => handleSalvageReply(client, reader),
  );
}
