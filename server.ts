import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";

const QUEUE_FILE = path.join(process.cwd(), 'scheduled_pins_queue.json');

if (!fs.existsSync(QUEUE_FILE)) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify([]));
}

function getQueue() {
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function saveQueue(queue: any[]) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

setInterval(async () => {
  const queue = getQueue();
  const now = Date.now();
  const pending = [];
  const due = [];

  for (const task of queue) {
    if (new Date(task.publish_at).getTime() <= now) {
      due.push(task);
    } else {
      pending.push(task);
    }
  }

  if (due.length > 0) {
    saveQueue(pending);
    
    for (const task of due) {
      try {
        console.log(`Publishing scheduled pin to ${task.targetUrl}`);
        const response = await fetch(task.targetUrl, task.options);
        const text = await response.text();
        console.log(`Publish result: ${response.status} ${text}`);
      } catch (e) {
        console.error(`Failed to publish scheduled pin:`, e);
      }
    }
  }
}, 60000);

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'test';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || 'test';
const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';

async function getPayPalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal token request failed: ${response.status} ${text}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

async function startServer() {
  const app = express();
  // Trust proxy is required for correct protocol detection behind Hostinger/Nginx proxies
  app.set('trust proxy', true);
  const PORT = process.env.PORT || 3000;

  if (!process.env.APP_URL) {
    console.warn("WARNING: APP_URL environment variable is not set. Redirect URIs will be generated dynamically based on request headers, which may be unreliable behind some proxies.");
  }
  if (!process.env.PINTEREST_APP_ID || !process.env.PINTEREST_APP_SECRET) {
    console.warn("WARNING: Pinterest API credentials (PINTEREST_APP_ID or PINTEREST_APP_SECRET) are missing from environment variables. Pinterest features may not work correctly.");
  }

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

  const getRedirectUri = (req: express.Request) => {
    // Priority 1: APP_URL from environment
    // Priority 2: Dynamic detection (works with trust proxy)
    let baseUrl = process.env.APP_URL;
    
    if (!baseUrl) {
      const host = req.get('host');
      const protocol = req.protocol;
      baseUrl = `${protocol}://${host}`;
    }

    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    const finalUri = `${baseUrl}/api/auth/pinterest/callback`;
    console.log("Generated Redirect URI:", finalUri);
    return finalUri;
  };

  // Payment Endpoints
  app.post('/api/create-checkout', async (req, res) => {
    try {
      const { userId } = req.body;
      let baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
      }

      const accessToken = await getPayPalAccessToken();

      const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              custom_id: userId,
              amount: {
                currency_code: 'USD',
                value: '1.00',
              },
              description: 'Pro Plan - 1 Month',
            },
          ],
          application_context: {
            return_url: `${baseUrl}/success`,
            cancel_url: `${baseUrl}/auth?plan=pro`,
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to create PayPal order: ${response.status} ${text}`);
      }

      const order = await response.json();
      if (order.id) {
        const approveLink = order.links.find((link: any) => link.rel === 'approve');
        res.json({ id: order.id, url: approveLink.href });
      } else {
        throw new Error(order.message || 'Failed to create PayPal order');
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/capture-subscription', async (req, res) => {
    try {
      const { token } = req.query;
      if (!token) {
        return res.status(400).json({ error: 'Missing token' });
      }

      const accessToken = await getPayPalAccessToken();

      const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${token as string}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to capture PayPal order: ${response.status} ${text}`);
      }

      const captureData = await response.json();

      if (captureData.status === 'COMPLETED') {
        const userId = captureData.purchase_units[0].custom_id;
        res.json({ success: true, userId });
      } else {
        res.json({ success: false });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Routes
  app.get("/api/auth/social/url", (req, res) => {
    const clientId = process.env.PINTEREST_APP_ID || "1550825";
    const redirectUri = getRedirectUri(req);
    console.log("Requesting Pinterest Auth URL for Client ID:", clientId, "Redirect URI:", redirectUri);
    
    const url = `https://www.pinterest.com/oauth/?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=pins:read,pins:write,boards:read,boards:write,user_accounts:read`;

    res.json({ url });
  });

  app.get("/api/auth/pinterest/callback", async (req, res) => {
    const { code } = req.query;
    const clientId = process.env.PINTEREST_APP_ID || "1550825";
    const clientSecret = process.env.PINTEREST_APP_SECRET || "9586e373e34a3bbcf4d873c348b0eb13a701bf4b";
    const redirectUri = getRedirectUri(req);

    if (!code) {
      res.status(400).send("No authorization code provided.");
      return;
    }

    try {
      // Exchange code for token
      const baseUrl = 'https://api.pinterest.com/v5';
      
      const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: redirectUri
        })
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${errText}`);
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Send success message to parent window and close popup
      res.send(`
        <html>
          <body>
            <script>
              try {
                // 1. Try localStorage (most reliable across same-origin popups)
                localStorage.setItem('pinterest_auth_token', '${accessToken}');
                localStorage.setItem('pinterest_auth_time', Date.now().toString());
                
                // 2. Try window.opener.postMessage
                if (window.opener) {
                  window.opener.postMessage({ type: 'PINTEREST_AUTH_SUCCESS', token: '${accessToken}' }, '*');
                }
              } catch (e) {
                console.error("Error communicating with opener:", e);
              }
              
              // Attempt to close immediately
              window.close();
              
              // Fallback to close after a short delay
              setTimeout(function() {
                window.close();
              }, 500);
              
              // If it's still open, redirect to the app with the token in the URL
              setTimeout(function() {
                window.location.href = '/app?pinterest_token=${accessToken}';
              }, 1000);
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("OAuth Callback Error:", error);
      res.status(500).send("Authentication failed. Please close this window and try again.");
    }
  });

  app.all('/api/social/*', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
      res.status(401).json({ error: 'No authorization header' });
      return;
    }

    const targetPath = req.url.replace('/api/social', '');
    const baseUrl = 'https://api.pinterest.com/v5';
    
    const makeRequest = async () => {
      const targetUrl = `${baseUrl}${targetPath}`;
      const options: RequestInit = {
        method: req.method,
        headers: {
          'Authorization': token,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      };

      if (req.method === 'DELETE' && targetPath.startsWith('/pins/scheduled_')) {
        const scheduledId = targetPath.replace('/pins/', '');
        console.log(`Intercepting DELETE for scheduled pin: ${scheduledId}`);
        const queue = getQueue();
        const newQueue = queue.filter(task => task.id !== scheduledId);
        saveQueue(newQueue);
        return new Response(JSON.stringify({ status: 'deleted' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (req.headers['content-type'] === 'application/octet-stream') {
        const payloadStr = req.headers['x-pin-payload'] as string;
        if (payloadStr) {
          const payload = JSON.parse(decodeURIComponent(payloadStr));
          
          payload.media_source.data = req.body.toString('base64');
          options.body = JSON.stringify(payload);
          (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
          
          if (payload.publish_at) {
            const publishTime = new Date(payload.publish_at).getTime();
            if (publishTime > Date.now()) {
              console.log('Intercepting scheduled pin for', payload.publish_at);
              const queue = getQueue();
              const scheduledId = 'scheduled_' + Date.now();
              
              // Remove publish_at from the payload so Pinterest doesn't reject it when we publish it later
              const payloadWithoutPublishAt = { ...payload };
              delete payloadWithoutPublishAt.publish_at;
              const optionsWithoutPublishAt = { ...options, body: JSON.stringify(payloadWithoutPublishAt) };

              queue.push({
                id: scheduledId,
                publish_at: payload.publish_at,
                targetUrl,
                options: optionsWithoutPublishAt
              });
              saveQueue(queue);
              return new Response(JSON.stringify({ id: scheduledId, status: 'scheduled' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        }
      } else {
        if (req.headers['content-type']) {
          (options.headers as Record<string, string>)['Content-Type'] = req.headers['content-type'];
        } else if (req.method !== 'GET' && req.method !== 'HEAD') {
          (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
          options.body = JSON.stringify(req.body);
        }
      }

      return fetch(targetUrl, options);
    };

    try {
      const response = await makeRequest();
      
      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = { message: text || 'Unknown error' };
      }
      
      res.status(response.status).json(data);
    } catch (error) {
      console.error('Pinterest API Proxy Error:', error);
      res.status(500).json({ error: 'Proxy request failed', details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
