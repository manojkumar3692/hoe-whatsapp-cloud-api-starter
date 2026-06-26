import { NextResponse } from "next/server";

export async function GET() {
  const response = await fetch(
    `https://graph.facebook.com/${process.env.META_API_VERSION}/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: "919902376600",
        type: "template",
        template: {
            name: "hoe_test_offer",
            language: {
              code: "en"
            },
            components: [
              {
                type: "body",
                parameters: [
                  {
                    type: "text",
                    text: "Manoj"
                  }
                ]
              }
            ]
          }
      }),
    }
  );

  const data = await response.json();
  return NextResponse.json(data);
}