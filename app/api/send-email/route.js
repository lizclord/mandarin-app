import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

export async function POST(request) {
  const { to, subject, text } = await request.json()

  try {
    await sgMail.send({
      to,
      from: 'lizzandtheman@gmail.com',
      subject,
      text,
    })
    return Response.json({ success: true })
  } catch (e) {
    console.error('Sendgrid error:', e.response?.body || e.message)
    return Response.json({ error:
