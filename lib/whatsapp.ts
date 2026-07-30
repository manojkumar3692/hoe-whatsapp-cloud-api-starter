type TemplateParam = { type: "text"; text: string };

export async function sendTemplateMessage(input: {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParams?: string[];
  buttonUrlParam?: string;
  headerImageUrl?: string;
}) {
  const version = process.env.META_API_VERSION || "v23.0";
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const token = process.env.META_WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error("Missing Meta WhatsApp env vars");
  }

  const components: any[] = [];

  if (input.headerImageUrl) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            link: input.headerImageUrl,
          },
        },
      ],
    });
  }

  if (input.bodyParams?.length) {
    components.push({
      type: "body",
      parameters: input.bodyParams.map(
        (text): TemplateParam => ({
          type: "text",
          text,
        })
      ),
    });
  }

  // Explicit string check, not a truthy check — an empty string "" is a
  // valid, meaningful button param (e.g. "fall back to the template's base
  // URL"), so it must still be sent as a real parameter. undefined means
  // "this template has no dynamic URL button, omit the component".
  if (typeof input.buttonUrlParam === "string") {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [
        {
          type: "text",
          text: input.buttonUrlParam,
        },
      ],
    });
  }

  const template: any = {
    name: input.templateName,
    language: {
      code: input.languageCode,
    },
  };

  if (components.length > 0) {
    template.components = components;
  }

  const payload = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template,
  };

  console.log("WHATSAPP PAYLOAD:", JSON.stringify(payload, null, 2));

  const res = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const json = await res.json();

  console.log("WHATSAPP RESPONSE:", JSON.stringify(json, null, 2));

  if (!res.ok) {
    throw new Error(JSON.stringify(json));
  }

  return json;
}

export async function sendTextMessage(input: {
  to: string;
  message: string;
}) {
  const version = process.env.META_API_VERSION || "v23.0";
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const token = process.env.META_WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error("Missing Meta WhatsApp env vars");
  }

  const payload = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "text",
    text: {
      preview_url: false,
      body: input.message,
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const json = await res.json();

  if (!res.ok) {
    throw new Error(JSON.stringify(json));
  }

  return json;
}

// Media sent by customers (images, voice notes, documents...) isn't hosted
// at a public URL — Meta requires a two-step, auth'd fetch: look up a
// short-lived URL by media id, then download from that URL with the same
// bearer token. Used by /api/media/[id] to proxy media into the browser.
export async function getMediaUrl(mediaId: string) {
  const version = process.env.META_API_VERSION || "v23.0";
  const token = process.env.META_WHATSAPP_TOKEN;

  if (!token) {
    throw new Error("Missing META_WHATSAPP_TOKEN");
  }

  const res = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json?.error?.message || JSON.stringify(json));
  }

  return json as {
    url: string;
    mime_type: string;
    file_size: number;
    id: string;
  };
}

export async function fetchMediaBytes(mediaId: string) {
  const token = process.env.META_WHATSAPP_TOKEN;

  if (!token) {
    throw new Error("Missing META_WHATSAPP_TOKEN");
  }

  const { url, mime_type } = await getMediaUrl(mediaId);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to download media ${mediaId} (${res.status})`);
  }

  const buffer = await res.arrayBuffer();

  return { buffer, mimeType: mime_type || "application/octet-stream" };
}