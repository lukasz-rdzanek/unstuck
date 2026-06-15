import { z } from "zod";

/**
 * Single source of truth shared by both SDK implementations (M5L2).
 * The Vercel AI SDK consumes REVIEW_SCHEMA (zod) directly via Output.object();
 * the Claude Agent SDK consumes REVIEW_JSON_SCHEMA (JSON Schema) via outputFormat.
 * Both derive the `Review` TS type from the same object.
 */

export const SYSTEM_PROMPT = `Jesteś precyzyjnym, konstruktywnym recenzentem kodu oceniającym pull request.
Oceń podany diff w pięciu kryteriach w skali 1-10 (1 = poważne braki, 10 = wzorowo):
poprawność implementacji, idiomatyczność, złożoność, pokrycie testami względem ryzyka, bezpieczeństwo.
Następnie wydaj wiążący werdykt (pass/fail) dla całej zmiany i dołącz krótkie podsumowanie (2-3 zdania)
w Markdown, na podstawie którego autor PR-a będzie mógł działać.`;

// Score'y trzymamy jako zwykłe z.number(): structured output Anthropica odrzuca
// minimum/maximum na typie integer, więc zakres 1-10 wymuszamy opisem pola i promptem,
// a nie samym schematem. Opisy (rubryki) to istotna dźwignia sterowania modelem.
export const REVIEW_SCHEMA = z.object({
  implementationCorrectness: z
    .number()
    .describe(
      "Poprawność implementacji: czy kod robi to, co deklaruje (skala 1-10). " +
        "1: logika jest błędna lub po cichu psuje istniejące zachowania. " +
        "10: poprawny na ścieżce głównej, w przypadkach brzegowych i w obsłudze błędów.",
    ),
  idiomaticity: z
    .number()
    .describe(
      "Idiomatyczność: zgodność z konwencjami języka i projektu (skala 1-10). " +
        "1: łamie konwencje repo (np. dyrektywy Next.js w projekcie Astro). " +
        "10: w pełni zgodny z konwencjami AGENTS.md/CLAUDE.md.",
    ),
  complexity: z
    .number()
    .describe(
      "Złożoność: prostota rozwiązania względem problemu (skala 1-10). " +
        "1: nieuzasadniona złożoność, trudny do utrzymania. 10: najprostsze rozwiązanie adekwatne do problemu.",
    ),
  testRiskCoverage: z
    .number()
    .describe(
      "Pokrycie testami proporcjonalne do ryzyka zmienianych ścieżek (skala 1-10). " +
        "1: ryzykowna zmiana bez testów. 10: pokrycie adekwatne do ryzyka (logika biznesowa, RLS, ścieżki bezpieczeństwa).",
    ),
  documentation: z
    .number()
    .describe(
      "Dokumentacja: czy zmiana jest udokumentowana tam, gdzie to istotne (skala 1-10). " +
        "1: nieoczywiste zachowanie lub zmiana kontraktu/schematu bez dokumentacji/komentarzy. " +
        "10: udokumentowane (docs kontekstowe, komentarze przy nieoczywistym kodzie, notki migracji).",
    ),
  securitySafety: z
    .number()
    .describe(
      "Bezpieczeństwo: brak podatności i wycieków sekretów (skala 1-10). " +
        "1: poważna podatność (np. nowa tabela bez RLS, wyciek sekretu, brakujący gate uprawnień, IDOR). " +
        "10: bez podatności; ścieżki dostępu i RLS są poprawne.",
    ),
  score: z
    .number()
    .describe(
      "Ogólna ocena całej zmiany w skali 1-10 (synteza sześciu kryteriów; " +
        "pojedyncza podatność krytyczna ściąga ją w dół). Na tym polu może stać twarda bramka.",
    ),
  verdict: z.enum(["pass", "fail"]).describe("Wiążący werdykt dla całej zmiany"),
  summary: z.string().describe("Podsumowanie w Markdown, gotowe jako komentarz do PR-a"),
});

// Pole target zapewnia zgodność między zodem a Claude Agent SDK (oczekuje draft-07).
export const REVIEW_JSON_SCHEMA = z.toJSONSchema(REVIEW_SCHEMA, { target: "draft-07" });

export type Review = z.infer<typeof REVIEW_SCHEMA>;

/** Stdin reader shared by both entry points. */
export async function readDiff(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
