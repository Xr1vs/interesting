module.exports = async function handler(req, res) {
  res.status(200).json({
    hasServerKey: Boolean(process.env.ROBLOX_API_KEY),
    creatorType: process.env.ROBLOX_CREATOR_TYPE || null,
    hasCreatorId: Boolean(process.env.ROBLOX_CREATOR_ID),
  });
};
