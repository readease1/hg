export default async function handler(req, res) {
  // No auth check - just test if endpoint works
  return res.status(200).json({
    success: true,
    message: "No auth test works!",
    timestamp: new Date().toISOString()
  });
}
