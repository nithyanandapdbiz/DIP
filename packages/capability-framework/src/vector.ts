/**
 * Vector intelligence — embeddings, similarity search and durable vector memory.
 *
 * TRACEABILITY
 *   Architecture : 06-data-sovereignty.md · 13-ai-operating-model.md · 19-repository-ownership.md
 *   ADR          : ADR-0023
 *   Criteria     : C-13.1 (AI proposes; code decides)
 *   Invariants   : INV-7 (functions with reasoning unavailable)
 *                  INV-9 / Rule 12 (no dependency on a named provider)
 *
 * WHAT THIS IS, PLAINLY.
 * These are hashed term vectors — the hashing trick — with sublinear term weighting and
 * L2 normalisation, compared by cosine. They are deterministic, provider-free, and
 * genuinely vectors: the same text always produces the same point, similar texts produce
 * near points, and nearest-neighbour search is a real cosine ranking over a real index.
 *
 * WHAT THIS IS NOT.
 * They are not learned embeddings. They capture lexical and morphological similarity,
 * not meaning. "Cancel an order" and "abort a purchase" are close to a learned model and
 * far apart here. That limit is stated rather than hidden, because a vector search that
 * silently under-recalls is worse than one whose reach is known.
 *
 * The design consequence is deliberate and is the same rule the platform applies to all
 * reasoning: with reasoning enabled, a ranking proposal may REORDER these results and
 * may not ADD to them. Recall is always deterministic and always the floor; reasoning
 * improves precision on top of it. A run with reasoning unavailable therefore returns
 * fewer well-ordered results, never no results — INV-7.
 *
 * SOVEREIGNTY.
 * A vector is one-way and lossy, but it is derived from text and is not a licence to
 * move that text. Nothing here stores the source: `add` takes an identifier and a vector
 * and keeps neither the document nor any excerpt of it. What crosses a plane boundary is
 * an identifier and a score, exactly as with every other repository signal.
 */

/** Fixed width. Wide enough that unrelated terms rarely collide, small enough to compare cheaply. */
export const EMBEDDING_DIMENSIONS = 96;

export type Embedding = readonly number[];

/** FNV-1a. Stable across processes and platforms, which a hashed embedding requires. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Lowercase alphanumeric tokens of two characters or more. */
export function tokenise(text: string): readonly string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 2);
}

/**
 * Embed text as a normalised hashed term vector.
 *
 * Each token contributes to one dimension with a hash-determined sign, so unrelated
 * tokens colliding on a dimension tend to cancel rather than reinforce. Weighting is
 * `1 + log(count)`: a term appearing ten times matters more than one appearing once, and
 * much less than ten times as much.
 *
 * Bigrams are included because word order carries most of the signal that distinguishes
 * "delete user" from "user delete" in navigation and journey text, which is the majority
 * of what this index holds.
 */
export function embed(text: string): Embedding {
  const tokens = tokenise(text);
  const counts = new Map<string, number>();

  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    const bigram = `${tokens[i]}_${tokens[i + 1]}`;
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }

  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const [term, count] of counts) {
    const h = hash32(term);
    const dimension = h % EMBEDDING_DIMENSIONS;
    const sign = (h >>> 31) === 1 ? -1 : 1;
    vector[dimension] = (vector[dimension] ?? 0) + sign * (1 + Math.log(count));
  }

  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  // The zero vector is a real outcome — text with no usable tokens — and it must stay
  // zero. Normalising it would invent a direction, and every query would then match it.
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

/** Cosine similarity. Both inputs are unit vectors, so this is their dot product. */
export function cosine(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += (a[i] ?? 0) * (b[i] ?? 0);
  // Floating-point accumulation can drift a hair outside [-1, 1], and a similarity of
  // 1.0000000000000002 will eventually be compared against a threshold by someone.
  return Math.max(-1, Math.min(1, dot));
}

export interface VectorRecord {
  readonly id: string;
  readonly kind: string;
  readonly vector: Embedding;
  /** Non-sensitive labels only. Never document content — see the header. */
  readonly labels: Readonly<Record<string, string>>;
}

export interface VectorMatch {
  readonly id: string;
  readonly kind: string;
  readonly similarity: number;
  readonly labels: Readonly<Record<string, string>>;
}

/**
 * A nearest-neighbour index.
 *
 * Exhaustive cosine scan. At the scale one discovery run produces — thousands of records,
 * not millions — an approximate index would add a recall cliff and a tuning parameter in
 * exchange for latency nobody is waiting on.
 */
export class VectorIndex {
  private readonly records: VectorRecord[] = [];

  add(id: string, kind: string, text: string, labels: Readonly<Record<string, string>> = {}): void {
    this.records.push({ id, kind, vector: embed(text), labels });
  }

  get size(): number { return this.records.length; }

  /**
   * The k nearest records above a similarity floor.
   *
   * The floor is not optional. Cosine always returns a best match, so an unfloored kNN
   * over an index of unrelated things returns confident nonsense — and a reuse decision
   * downstream would act on it.
   */
  search(text: string, k: number, floor = 0.2, kind?: string): readonly VectorMatch[] {
    const query = embed(text);
    return this.records
      .filter((r) => kind === undefined || r.kind === kind)
      .map((r) => ({ id: r.id, kind: r.kind, similarity: cosine(query, r.vector), labels: r.labels }))
      .filter((m) => m.similarity >= floor)
      // Ties broken by id so the ordering is total and a run is reproducible.
      .sort((a, b) => (b.similarity - a.similarity) || (a.id < b.id ? -1 : 1))
      .slice(0, Math.max(0, k));
  }

  /**
   * Apply a ranking proposal.
   *
   * A proposal may REORDER what search found and may NOT ADD to it. A match nothing
   * observed is not a match, whatever proposed it — the same rule the platform applies
   * to every reasoning output, here enforced by intersection rather than by trust.
   */
  static applyRanking(found: readonly VectorMatch[], proposedOrder: unknown): readonly VectorMatch[] {
    if (!Array.isArray(proposedOrder)) return found;
    const known = new Map(found.map((m) => [m.id, m]));
    const reordered: VectorMatch[] = [];
    for (const id of proposedOrder) {
      const match = typeof id === 'string' ? known.get(id) : undefined;
      if (match && !reordered.includes(match)) reordered.push(match);
    }
    // Anything the proposal omitted keeps its deterministic place at the back. Dropping
    // it would let a proposal delete evidence by silence.
    for (const match of found) if (!reordered.includes(match)) reordered.push(match);
    return reordered;
  }
}

/**
 * Vector memory — what the platform remembers between runs.
 *
 * Separate from `VectorIndex` because the lifetime is different, and the difference is
 * the whole point: an index is built and discarded within a run; memory accumulates
 * across them and is what makes the engine improve rather than merely repeat.
 *
 * It holds vectors and labels. It does not hold customer text, so it is not a copy of
 * the customer's application in the Intelligence Plane — it is a set of directions and
 * identifiers, which is what E-5 non-retention permits.
 */
export class VectorMemory {
  private readonly index = new VectorIndex();
  private readonly kinds = new Map<string, number>();

  remember(kind: string, id: string, text: string, labels: Readonly<Record<string, string>> = {}): void {
    this.index.add(id, kind, text, labels);
    this.kinds.set(kind, (this.kinds.get(kind) ?? 0) + 1);
  }

  recall(kind: string, text: string, k = 5, floor = 0.2): readonly VectorMatch[] {
    return this.index.search(text, k, floor, kind);
  }

  get size(): number { return this.index.size; }

  /** What is remembered, by kind. Counts only — the census, never the content. */
  get census(): Readonly<Record<string, number>> {
    return Object.fromEntries([...this.kinds.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  }
}
