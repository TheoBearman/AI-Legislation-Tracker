/**
 * Strict AI filter - only returns true if "AI" or "artificial intelligence"
 * is explicitly mentioned in the title or abstract/summary
 */
export function hasExplicitAIMention(
    title?: string | null,
    summary?: string | null,
    abstracts?: any[] | null
): boolean {
    const titleLower = (title || '').toLowerCase();
    const summaryLower = (summary || '').toLowerCase();

    // Check abstracts
    let abstractText = '';
    if (abstracts && Array.isArray(abstracts)) {
        abstractText = abstracts
            .map((a: any) => (a.abstract || ''))
            .join(' ')
            .toLowerCase();
    }

    // Check for explicit mentions
    const hasArtificialIntelligence =
        titleLower.includes('artificial intelligence') ||
        summaryLower.includes('artificial intelligence') ||
        abstractText.includes('artificial intelligence');

    const hasAI =
        /\bai\b/i.test(title || '') ||
        /\bai\b/i.test(summary || '') ||
        /\bai\b/i.test(abstractText);

    return hasArtificialIntelligence || hasAI;
}
