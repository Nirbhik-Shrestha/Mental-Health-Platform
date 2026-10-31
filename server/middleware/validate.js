const formatIssues = (error) =>
  error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));

/**
 * Validates req.body (replacing it with the parsed result) or req.query
 * (parsed result goes on req.validQuery, since Express 5's req.query is read-only).
 */
export const validate =
  (schema, source = "body") =>
  (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      return res.status(400).json({ error: "Please check the highlighted fields", details: formatIssues(result.error) });
    }
    if (source === "query") req.validQuery = result.data;
    else req.body = result.data;
    next();
  };
