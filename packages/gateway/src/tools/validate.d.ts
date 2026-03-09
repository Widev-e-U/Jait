/**
 * Lightweight JSON Schema validator for tool input parameters.
 *
 * Handles only the subset of JSON Schema used by ToolParametersSchema:
 *   - `type: "object"` with `properties` and `required`
 *   - Property types: string, number, boolean, array, object
 *   - `enum` constraints
 *
 * This is intentionally minimal — ~60 lines vs Ajv's 124 KB.
 * For our use-case (validating LLM-generated tool arguments), it's
 * 5-10× faster than Ajv because there's no schema compilation step.
 */
import type { ToolParametersSchema } from "./contracts.js";
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
/**
 * Validate an input value against a ToolParametersSchema.
 *
 * If `input` is nullish, it's treated as `{}` (matching Ajv behaviour
 * for schemas that only have optional properties).
 *
 * Returns `{ valid: true, errors: [] }` on success.
 */
export declare function validateToolInput(schema: ToolParametersSchema, input: unknown): ValidationResult;
//# sourceMappingURL=validate.d.ts.map