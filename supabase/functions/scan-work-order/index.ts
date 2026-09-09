import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("=== СТАРТ СКАНУВАННЯ ДОКУМЕНТА ===");

    const { imageBase64, imagesBase64 } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      throw new Error("API ключ OpenAI не знайдено на сервері");
    }

    let photosArray: string[] = [];
    if (imagesBase64 && Array.isArray(imagesBase64)) {
      photosArray = imagesBase64;
    } else if (imageBase64) {
      photosArray = [imageBase64];
    } else {
      throw new Error("Фотографії не були передані");
    }

    const imageContentParts = photosArray.map((b64: string) => {
      const cleanB64 = b64.replace(/^data:image\/\w+;base64,/, "");
      return {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${cleanB64}`,
          detail: "high",
        },
      };
    });

    console.log(
      `Відправляємо ${photosArray.length} зображень до OpenAI API (gpt-4o)...`,
    );

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "work_order_schema",
            strict: true,
            schema: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["Address", "Service"],
                  description:
                    "Strictly return 'Address' for standard installations, or 'Service' if the document explicitly mentions repair, warranty, or is a service ticket.",
                },
                work_order_number: {
                  type: "string",
                  description: "Extract the Order Number or Job Number",
                },
                builder_name: {
                  type: "string",
                  description:
                    "Extract the builder/client name from 'Reference', 'Sold To', or 'Job:' section.",
                },
                store_name: {
                  type: "string",
                  description:
                    "Identify the store issuing the ticket, or empty string.",
                },
                address: {
                  type: "string",
                  description:
                    "Full job site address from 'Ship To' or 'Install At'. CRITICAL: Strip out any client names or phone numbers from this field, return ONLY the physical address.",
                },
                date: {
                  type: "string",
                  description:
                    "Extract the date. Format strictly as YYYY-MM-DD. Priority: 1. Install Date, 2. Order Date, 3. Date Printed. Return empty string if missing.",
                },
                total_amount: {
                  type: "number",
                  description:
                    "Total labor amount at the bottom of the document. Return ONLY a raw number (e.g., 1234.50). DO NOT include currency symbols ($) or commas (,). Return 0 if missing.",
                },
                ai_translation: {
                  type: "string",
                  description:
                    "Translate ONLY GENERAL document notes into Ukrainian. STRICT FORMAT: '[Ukrainian translation] ([ORIGINAL ENGLISH TEXT])'. See system prompt for STRICT exclusions.",
                },
                work_types: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: {
                        type: "string",
                        description:
                          "Clean name of the work or material (e.g., 'Main Floor - Floor', 'LVP CLICK INSTALL', 'Vinyl Plank').",
                      },
                      area: {
                        type: "string",
                        description:
                          "Specific zone if mentioned. Empty string if not.",
                      },
                      sq_ft: {
                        type: "number",
                        description:
                          "Quantity / Area value. Return ONLY a raw number (no commas, no text). 0 if missing.",
                      },
                      rate: {
                        type: "number",
                        description:
                          "Unit Price / Rate. Return ONLY a raw number (no commas, no currency signs). 0 if missing.",
                      },
                      amount: {
                        type: "number",
                        description:
                          "Total/Extended Price for this line. Return ONLY a raw number (no commas, no currency signs). 0 if missing.",
                      },
                      line_notes: {
                        type: "string",
                        description:
                          "Translate text found directly under this item into Ukrainian. STRICT FORMAT: '[Ukrainian translation] ([ORIGINAL ENGLISH TEXT])'. Empty string if none.",
                      },
                    },
                    required: [
                      "name",
                      "area",
                      "sq_ft",
                      "rate",
                      "amount",
                      "line_notes",
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: [
                "type",
                "work_order_number",
                "builder_name",
                "store_name",
                "address",
                "date",
                "total_amount",
                "ai_translation",
                "work_types",
              ],
              additionalProperties: false,
            },
          },
        },
        messages: [
          {
            role: "system",
            content:
              "You are an OCR and data extraction specialist for construction work orders. Combine information from all provided sequential images of the same document into a single JSON result. CRITICAL RULE FOR TRANSLATIONS: Whenever you translate text to Ukrainian (for 'line_notes' or 'ai_translation'), you MUST ALWAYS append the exact original English text in parentheses. FORMAT: 'Переклад (ORIGINAL TEXT)'. DO NOT invent or copy text from other items if it does not exist.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze these sequential images of a work order / job tracker. Combine all items and data across all images into a single JSON response.

CRITICAL INSTRUCTIONS FOR EXTRACTION:
1. Identifying Items & Boundaries (VISUAL CUES): 
   - IF the document has SOLID HORIZONTAL BLACK LINES (like "The Floor Show"), use them as strict visual boundaries. EVERYTHING between two horizontal lines belongs to THAT SINGLE line item.
   - IF there are NO horizontal lines (like "Touchtone"), use grid boxes and vertical spacing to separate items. 
   - NEVER merge separate items. Extract ALL line items, including those with a rate/amount of $0.00.
2. SPATIAL SEPARATION OF NOTES:
   - 'line_notes': Look DIRECTLY BENEATH a specific item description within its visual boundaries (between the black lines). You MUST capture any text marked as "Order Line Notes:", "Order Custom Notes:", or faint secondary text indicating the zone. IF THERE ARE MULTIPLE PARAGRAPHS of notes under one item, COMBINE THEM into the single 'line_notes' field for that specific item. DO NOT split notes belonging to one item across multiple items. Leave 'line_notes' empty if there is no text.
   - 'ai_translation': Look for GENERAL notes located at the top, bottom, or dedicated notes sections. DO NOT mix line item notes here.
3. Project Type: MUST be strictly "Address" or "Service" (Service if it mentions repair/warranty).
4. SMART CONTACT FILTERING: You must NOT extract contact names and phone numbers (e.g., "Alex Cirka: 587-589-3275"). HOWEVER, if there are legitimate work instructions in the exact same block (e.g., "Do not Silicone. Silicone is to be done by Streetside"), you MUST extract and translate those specific work instructions into 'line_notes'. Do not drop the work instructions just because they sit next to a phone number!

SPECIAL RULES FOR GENERAL NOTES ('ai_translation'):
- EXTREMELY IMPORTANT FOR 'TOUCHSTONE' STORE: You MUST ABSOLUTELY IGNORE any boilerplate or legal text. NEVER extract sentences starting with "NOTE- KINDLY CHECK THE PRICES" or "IMPORTANT NOTE- ANY LIABILITY CAUSED BY ANY INSTALLER". If you extract this boilerplate text, the system will crash.
- YOU MUST ACTIVELY LOOK FOR HANDWRITTEN NOTES. Look closely at the top right corner, next to dates, or empty spaces for handwritten text (e.g., dates like "Sep 11", "HOUSE READY"). You MUST extract and translate these handwritten notes into the 'ai_translation' field. Example format: "Встановлення: 11 Вересня (Sep 11)".`,
              },
              ...imageContentParts,
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    console.log("=== СИРА ВІДПОВІДЬ ШІ (RAW) ===");
    console.log(JSON.stringify(data, null, 2));

    if (data.error) {
      throw new Error(`OpenAI Error: ${data.error.message}`);
    }

    const parsedContent = JSON.parse(data.choices[0].message.content);

    console.log("=== РОЗПАРСЕНИЙ РЕЗУЛЬТАТ (ЩО ЙДЕ НА САЙТ) ===");
    console.log(JSON.stringify(parsedContent, null, 2));

    return new Response(JSON.stringify(parsedContent), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("=== ПОМИЛКА СКАНУВАННЯ ===");
    console.error("Деталі:", error.message || error);

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
