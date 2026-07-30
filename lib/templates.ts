function version() {
  return process.env.META_API_VERSION || "v23.0";
}

function wabaId() {
  const id = process.env.META_WABA_ID;
  if (!id) throw new Error("Missing META_WABA_ID env var");
  return id;
}

function token() {
  const t = process.env.META_WHATSAPP_TOKEN;
  if (!t) throw new Error("Missing META_WHATSAPP_TOKEN env var");
  return t;
}

// Meta template names must be lowercase, alphanumeric + underscores only.
export function normalizeTemplateName(raw: string) {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Counts {{1}}, {{2}}... placeholders in a body/header text so we know how
// many example values Meta requires for approval.
export function extractVariableCount(text: string) {
  const matches = [...(text || "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
  const nums = matches.map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

export type CreateTemplateInput = {
  name: string;
  category: string; // MARKETING | UTILITY | AUTHENTICATION
  language: string; // e.g. en, en_US, hi
  headerType: "none" | "text";
  headerText?: string;
  bodyText: string;
  bodyExamples?: string[];
  footerText?: string;
  buttonType: "none" | "url" | "phone";
  buttonText?: string;
  buttonUrl?: string;
  buttonPhone?: string;
};

function buildComponents(input: CreateTemplateInput) {
  const components: any[] = [];

  if (input.headerType === "text" && input.headerText) {
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: input.headerText,
    });
  }

  const bodyComponent: any = {
    type: "BODY",
    text: input.bodyText,
  };

  if (input.bodyExamples?.length) {
    bodyComponent.example = { body_text: [input.bodyExamples] };
  }

  components.push(bodyComponent);

  if (input.footerText) {
    components.push({ type: "FOOTER", text: input.footerText });
  }

  if (input.buttonType === "url" && input.buttonText && input.buttonUrl) {
    const button: any = {
      type: "URL",
      text: input.buttonText,
      url: input.buttonUrl,
    };

    // Meta requires an example URL when the button ends in a {{1}}
    // variable (dynamic per-recipient link), same idea as body examples.
    if (input.buttonUrl.includes("{{1}}")) {
      button.example = [input.buttonUrl.replace("{{1}}", "sample123")];
    }

    components.push({ type: "BUTTONS", buttons: [button] });
  }

  if (input.buttonType === "phone" && input.buttonText && input.buttonPhone) {
    components.push({
      type: "BUTTONS",
      buttons: [
        {
          type: "PHONE_NUMBER",
          text: input.buttonText,
          phone_number: input.buttonPhone,
        },
      ],
    });
  }

  return components;
}

// Submits a new template to Meta for review.
// Docs: POST /{WABA_ID}/message_templates
export async function createMetaTemplate(input: CreateTemplateInput) {
  const payload = {
    name: input.name,
    category: input.category,
    language: input.language,
    components: buildComponents(input),
  };

  const res = await fetch(
    `https://graph.facebook.com/${version()}/${wabaId()}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const json = await res.json();

  console.log("META TEMPLATE CREATE PAYLOAD:", JSON.stringify(payload, null, 2));
  console.log("META TEMPLATE CREATE RESPONSE:", JSON.stringify(json, null, 2));

  if (!res.ok) {
    throw new Error(json?.error?.error_user_msg || json?.error?.message || JSON.stringify(json));
  }

  // { id, status, category }
  return json;
}

// Pulls current approval status for every template on the WABA.
// Docs: GET /{WABA_ID}/message_templates
export async function listMetaTemplates() {
  const res = await fetch(
    `https://graph.facebook.com/${version()}/${wabaId()}/message_templates?fields=id,name,status,category,language,rejected_reason&limit=200`,
    {
      headers: { Authorization: `Bearer ${token()}` },
    }
  );

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json?.error?.message || JSON.stringify(json));
  }

  return (json.data || []) as Array<{
    id: string;
    name: string;
    status: string;
    category: string;
    language: string;
    rejected_reason?: string;
  }>;
}
