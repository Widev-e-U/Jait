// Shared by all assessment adapters so multiple tools/routes cannot multiply
// gateway scan concurrency. Status checks and evidence reads need no lease.
let owner: string | null = null;
export function claimAssessmentExecution(id: string): () => void {
  if (owner) throw new Error("A security assessment is already running on this gateway");
  owner = id;
  return () => { if (owner === id) owner = null; };
}
