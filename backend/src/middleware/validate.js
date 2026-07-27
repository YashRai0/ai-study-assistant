// Reusable request-body validator: pass a Zod schema, get back Express
// middleware that rejects malformed input before it reaches route logic
// (rather than each route hand-rolling its own "if (!message) ..." checks).
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.errors[0]?.message || "Invalid request.";
      return res.status(400).json({ error: message });
    }
    req.body = result.data;
    next();
  };
}
