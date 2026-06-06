const { AccessToken } = require("livekit-server-sdk");

const getToken = async (req, res) => {
  try {
    const { roomName, participantName, userId } = req.body;

    if (!roomName || !participantName || !userId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, LIVEKIT_URL: serverUrl } = process.env;

    if (!apiKey || !apiSecret || !serverUrl) {
      return res.status(500).json({ error: "LiveKit credentials are not set in .env" });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId.toString(),
      name: participantName,
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

    const token = await at.toJwt();
    res.json({ token, serverUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getToken };
