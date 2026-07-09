import {
  AccountReply,
  AccountReplyServerPacket,
  type EoReader,
  PacketAction,
  PacketFamily,
} from 'eolib';
import type { Client } from '@/client';

// Custom server action for the AccountConfig deep packet — must match reoserv
// src/deep/mod.rs ACTION_CONFIG. Wire: short delay_time, char email_validation,
// char enabled. Pushed at connection-accept (pre-login) and on account request.
const ACTION_CONFIG = 220;

function handleAccountReply(client: Client, reader: EoReader) {
  const packet = AccountReplyServerPacket.deserialize(reader);
  if (packet.replyCode in AccountReply) {
    client.authenticationController.notifyAccountReply(packet.replyCode);
    return;
  }
  const data =
    packet.replyCodeData as AccountReplyServerPacket.ReplyCodeDataDefault;
  client.authenticationController.finishAccountCreation(
    packet.replyCode as number,
    data.sequenceStart,
  );
}

function handleAccountConfig(client: Client, reader: EoReader) {
  reader.getShort(); // delay_time (unused client-side)
  reader.getChar(); // email_validation (unused client-side)
  const enabled = reader.getChar() === 1;
  client.setRegistrationEnabled(enabled);
}

export function registerAccountHandlers(client: Client) {
  client.bus!.registerPacketHandler(
    PacketFamily.Account,
    PacketAction.Reply,
    (reader) => handleAccountReply(client, reader),
  );
  client.bus!.registerPacketHandler(
    PacketFamily.Account,
    ACTION_CONFIG as PacketAction,
    (reader) => handleAccountConfig(client, reader),
  );
}
