import { AppError } from '../utils/errors.js';

const SOURCES = ['params', 'query', 'body'];

/**
 * middleware: ตรวจ input ด้วย Zod แล้วแทนที่ด้วยค่าที่ผ่านการแปลง type
 * รูปแบบ error ตาม 04: { error: { code: 'VALIDATION_ERROR', message, details: [{field, issue}] } }
 * @param {{ params?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, body?: import('zod').ZodTypeAny }} schemas
 */
export function validate(schemas) {
  return (req, _res, next) => {
    /** @type {Array<{field: string, issue: string}>} */
    const details = [];

    for (const source of SOURCES) {
      const schema = schemas?.[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source] ?? {});
      if (result.success) {
        req[source] = result.data;
        continue;
      }

      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        details.push({
          field: path ? `${source}.${path}` : source,
          issue: issue.message,
        });
      }
    }

    if (details.length > 0) {
      return next(AppError.badRequest(details[0].issue, details));
    }
    return next();
  };
}

export default { validate };
