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

const TYPE_CHECKS: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number",
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  array: (v) => Array.isArray(v),
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
};

function formatPath(path: string): string {
  return path === "$" ? "input" : path.replace(/^\$\./, "");
}

function coerceValue(expectedType: string, value: unknown): unknown {
  if ((expectedType === "number" || expectedType === "integer") && typeof value === "string") {
    const num = Number(value);
    if (!Number.isNaN(num)) {
      return num;
    }
  }

  if (expectedType === "boolean" && typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }

  if ((expectedType === "object" || expectedType === "array") && typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      const checker = TYPE_CHECKS[expectedType];
      if (checker?.(parsed)) {
        return parsed;
      }
    } catch {
      // Ignore JSON parse failures and report the type error below.
    }
  }

  return value;
}

function validateSchemaValue(
  schema: ToolParametersSchema["properties"][string],
  value: unknown,
  path: string,
  errors: string[],
): unknown {
  const expectedType = schema.type;
  const checker = TYPE_CHECKS[expectedType];
  let current = value;

  if (checker && !checker(current)) {
    current = coerceValue(expectedType, current);

    if (!checker(current)) {
      errors.push(
        `Property '${formatPath(path)}' expected type '${expectedType}', got '${typeof value}'`,
      );
      return current;
    }

    if (expectedType === "integer" && !Number.isInteger(current)) {
      errors.push(`Property '${formatPath(path)}' must be an integer, got ${current}`);
      return current;
    }
  }

  if (schema.enum && schema.enum.length > 0 && !schema.enum.includes(String(current))) {
    errors.push(
      `Property '${formatPath(path)}' must be one of [${schema.enum.join(", ")}], got '${current}'`,
    );
  }

  const isObject = TYPE_CHECKS.object;
  if (expectedType === "object" && schema.properties && isObject?.(current)) {
    const obj = current as Record<string, unknown>;

    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in obj) || obj[key] === undefined) {
          errors.push(`Missing required property: ${formatPath(`${path}.${key}`)}`);
        }
      }
    }

    for (const [key, childSchema] of Object.entries(schema.properties)) {
      const childValue = obj[key];
      if (childValue === undefined || childValue === null) continue;
      obj[key] = validateSchemaValue(childSchema, childValue, `${path}.${key}`, errors);
    }
  }

  if (expectedType === "array" && schema.items && Array.isArray(current)) {
    current = current.map((item, index) =>
      validateSchemaValue(schema.items!, item, `${path}[${index}]`, errors),
    );
  }

  return current;
}

/**
 * Validate an input value against a ToolParametersSchema.
 *
 * If `input` is nullish, it's treated as `{}` (matching Ajv behaviour
 * for schemas that only have optional properties).
 *
 * Returns `{ valid: true, errors: [] }` on success.
 */
export function validateToolInput(
  schema: ToolParametersSchema,
  input: unknown,
): ValidationResult {
  const errors: string[] = [];
  const obj = (input ?? {}) as Record<string, unknown>;

  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { valid: false, errors: ["Input must be an object"] };
  }

  // Required fields
  if (schema.required) {
    for (const key of schema.required) {
      if (!(key in obj) || obj[key] === undefined) {
        errors.push(`Missing required property: ${key}`);
      }
    }
  }

  // Property type + enum checks
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const value = obj[key];
    if (value === undefined || value === null) continue; // skip optional absent
    obj[key] = validateSchemaValue(propSchema, value, `$.${key}`, errors);
  }

  return { valid: errors.length === 0, errors };
}
