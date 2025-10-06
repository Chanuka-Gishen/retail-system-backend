import jwt from "jsonwebtoken";

export const generateAccessToken = (id, role) => {
  return jwt.sign({ id: id, role: role }, process.env.JWT_SECRET);
};

export const generateRefreshToken = (id) => {
  return jwt.sign({ id: id }, process.env.JWT_SECRET);
};

export const verifyUserToken = (req) => {
  let token = req.header("Authorization");
  token = token.slice(7, token.length).trimLeft();

  const payload = jwt.verify(token, process.env.JWT_SECRET);
  return payload;
};
