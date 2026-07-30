// Turns a raw WhatsApp Cloud API inbound message object into a short,
// human-readable summary. Used as the `body` fallback stored in
// message_logs (inbox list previews, search) and as the text fallback in
// the chat view. The chat view additionally renders richer content
// (images, audio, documents, etc.) straight from raw_response — this is
// just the plain-text summary.
//
// Previously anything that wasn't type "text" fell through to a bare
// "[TYPE message]" string, which is the "unsupported message" bug — every
// photo, voice note, button tap, and location pin looked identical and
// gave no idea what the customer actually sent.
export function describeInboundMessage(msg: any): string {
  const type = msg?.type;

  if (!type || type === "text") {
    return msg?.text?.body || "";
  }

  if (type === "image") {
    return msg.image?.caption ? `📷 ${msg.image.caption}` : "📷 Photo";
  }

  if (type === "video") {
    return msg.video?.caption ? `🎥 ${msg.video.caption}` : "🎥 Video";
  }

  if (type === "audio") {
    return msg.audio?.voice ? "🎤 Voice message" : "🎵 Audio";
  }

  if (type === "document") {
    return `📄 ${msg.document?.filename || "Document"}`;
  }

  if (type === "sticker") {
    return "🏷️ Sticker";
  }

  if (type === "location") {
    return msg.location?.name
      ? `📍 ${msg.location.name}`
      : "📍 Location shared";
  }

  if (type === "contacts") {
    const name = msg.contacts?.[0]?.name?.formatted_name;
    return name ? `👤 Contact: ${name}` : "👤 Contact shared";
  }

  if (type === "button") {
    return `↩️ ${msg.button?.text || "Button reply"}`;
  }

  if (type === "interactive") {
    const reply = msg.interactive?.button_reply || msg.interactive?.list_reply;
    return reply?.title ? `↩️ ${reply.title}` : "↩️ Interactive reply";
  }

  if (type === "reaction") {
    return msg.reaction?.emoji ? `${msg.reaction.emoji} Reacted` : "Reacted";
  }

  if (type === "unsupported") {
    const reason = msg.errors?.[0]?.title;
    return reason ? `⚠️ ${reason}` : "⚠️ Unsupported message type";
  }

  return `[${type} message]`;
}
