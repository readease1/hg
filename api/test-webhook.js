export default async function handler(req, res) {
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  
  if (req.method === 'POST') {
    return res.status(200).json({ 
      received: true, 
      body: req.body,
      timestamp: new Date().toISOString()
    });
  }
  
  return res.status(200).json({ message: 'Webhook test endpoint' });
}
