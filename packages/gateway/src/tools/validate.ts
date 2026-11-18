/**
 * Lightweight JSON Schema validator for tool input parameters.
 *
 * Handles only the subset of JSON Schema used by ToolParametersSchema:
 *   - `type: "object"` with `properties` and `required`
 *   - Property types: string, number, boolean, array, object
 *   - `enum`, string/array bounds, and string patterns
 *   - `allOf` conditional `if`/`then` action requirements
 *
 * Keep validation aligned with the schema advertised to the model.
 */

import type { ToolParametersSchema } from "./contracts.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const TYPE_CHECKS: Record<string, (v: unknown) => boolean> = {
  null: (v) => v === null,
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
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
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (value === null && types.includes("null")) return null;
  const expectedType = types.find((type) => TYPE_CHECKS[type]?.(value)) ?? types.find((type) => type !== "null") ?? "null";
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

  if (typeof current === "string") {
    if (schema.minLength !== undefined && current.length < schema.minLength)
      errors.push(`Property '${formatPath(path)}' must contain at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && current.length > schema.maxLength)
      errors.push(`Property '${formatPath(path)}' must contain at most ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(current))
      errors.push(`Property '${formatPath(path)}' must match pattern ${schema.pattern}`);
  }
  if (Array.isArray(current)) {
    if (schema.minItems !== undefined && current.length < schema.minItems)
      errors.push(`Property '${formatPath(path)}' must contain at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && current.length > schema.maxItems)
      errors.push(`Property '${formatPath(path)}' must contain at most ${schema.maxItems} items`);
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
      const type = schema.properties[key]?.type;
      const nullable = Array.isArray(type) ? type.includes("null") : type === "null";
      if (!(key in obj) || obj[key] === undefined || (obj[key] === null && !nullable)) {
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

  // The same constraints are advertised to providers and enforced before dispatch.
  for (const condition of schema.allOf ?? []) {
    const matches = validateToolInput({ type: "object", ...condition.if }, { ...obj });
    if (matches.valid) {
      const result = validateToolInput({ type: "object", properties: {}, ...condition.then }, obj);
      errors.push(...result.errors);
    }
  }
  return { valid: errors.length === 0, errors };
}
