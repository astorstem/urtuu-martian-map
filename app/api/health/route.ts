export function GET() {
  return Response.json({
    status: "ok",
    application: "URTUU",
    version: "0.1.0",
  });
}
