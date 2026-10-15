import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role }; 
    next();
    console.log("User decoded from token:", decoded);
    console.log("req.user:", req.user);

  } catch (err) {
    res.status(403).json({ message: "Forbidden" });
  }
};

export default authMiddleware;
