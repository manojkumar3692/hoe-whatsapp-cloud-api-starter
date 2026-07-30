import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import {
  createMetaTemplate,
  extractVariableCount,
  normalizeTemplateName,
  uploadTemplateHeaderImage,
} from "../../../../lib/templates";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const name = normalizeTemplateName(String(form.get("name") || ""));
    const category = String(form.get("category") || "MARKETING");
    const language = String(form.get("language") || "en");
    const headerType = String(form.get("header_type") || "none") as
      | "none"
      | "text"
      | "image";
    const headerText = String(form.get("header_text") || "").trim();
    const headerImageUrl = String(form.get("header_image_url") || "").trim();
    const bodyText = String(form.get("body_text") || "").trim();
    const footerText = String(form.get("footer_text") || "").trim();
    const buttonType = String(form.get("button_type") || "none") as
      | "none"
      | "url"
      | "phone";
    const buttonText = String(form.get("button_text") || "").trim();
    const buttonUrl = String(form.get("button_url") || "").trim();
    const buttonPhone = String(form.get("button_phone") || "").trim();
    const bodyExamplesRaw = String(form.get("body_examples") || "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Template name required" },
        { status: 400 }
      );
    }

    if (!bodyText) {
      return NextResponse.json(
        { error: "Body text required" },
        { status: 400 }
      );
    }

    if (headerType === "image" && !headerImageUrl) {
      return NextResponse.json(
        { error: "Header image URL required when header type is Image" },
        { status: 400 }
      );
    }

    const variableCount = extractVariableCount(bodyText);
    const bodyExamples = bodyExamplesRaw
      ? bodyExamplesRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (variableCount > 0 && bodyExamples.length < variableCount) {
      return NextResponse.json(
        {
          error: `Body text uses ${variableCount} variable(s) like {{1}}, {{2}} — provide that many comma-separated example values.`,
        },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const componentsSnapshot = {
      headerType,
      headerText,
      headerImageUrl,
      bodyText,
      bodyExamples,
      footerText,
      buttonType,
      buttonText,
      buttonUrl,
      buttonPhone,
    };

    let metaResult;

    try {
      let headerImageHandle: string | undefined;

      if (headerType === "image") {
        // One-time upload so Meta has an example image to review. Sending
        // this template later uses a plain URL per message instead (see
        // sendTemplateMessage) — this handle is only for template creation.
        headerImageHandle = await uploadTemplateHeaderImage(headerImageUrl);
      }

      metaResult = await createMetaTemplate({
        name,
        category,
        language,
        headerType,
        headerText: headerType === "text" ? headerText : undefined,
        headerImageHandle,
        bodyText,
        bodyExamples: bodyExamples.length ? bodyExamples : undefined,
        footerText: footerText || undefined,
        buttonType,
        buttonText: buttonText || undefined,
        buttonUrl: buttonUrl || undefined,
        buttonPhone: buttonPhone || undefined,
      });
    } catch (metaError: any) {
      await supabase.from("whatsapp_templates").upsert(
        {
          name,
          category,
          language,
          status: "REJECTED",
          rejected_reason: metaError.message,
          components: componentsSnapshot,
        },
        { onConflict: "name,language" }
      );

      return NextResponse.json({ error: metaError.message }, { status: 400 });
    }

    const { error: dbError } = await supabase
      .from("whatsapp_templates")
      .upsert(
        {
          meta_template_id: metaResult.id,
          name,
          category,
          language,
          status: metaResult.status || "PENDING",
          rejected_reason: null,
          components: componentsSnapshot,
        },
        { onConflict: "name,language" }
      );

    if (dbError) {
      throw dbError;
    }

    return NextResponse.redirect(
      new URL(`/templates?created=${name}`, req.url),
      303
    );
  } catch (e: any) {
    console.error("TEMPLATE CREATE ERROR:", e);

    return NextResponse.json(
      { error: e.message || "Template creation failed" },
      { status: 500 }
    );
  }
}
