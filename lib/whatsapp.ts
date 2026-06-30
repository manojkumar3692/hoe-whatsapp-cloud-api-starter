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

  if (input.buttonUrlParam) {
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