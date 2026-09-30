export async function verifyPublication(marker, versionId, {
  accountId, fetcher = fetch, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 12, token = process.env.CLOUDFLARE_API_TOKEN
} = {}) {
  const api = async (path) => {
    const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/financial-reports-for-kids/${path}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Worker verification API: HTTP ${response.status}`);
    const json = await response.json();
    if (!json.success) throw new Error("Worker verification API rejected request");
    return json.result;
  };
  const version = await api(`versions/${versionId}`);
  if (version.id !== versionId || version.annotations?.["workers/tag"] !== marker.commit) {
    throw new Error("Uploaded Worker version does not identify the expected Git commit");
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const { deployments } = await api("deployments");
      const latest = deployments[0];
      if (latest?.versions?.length !== 1 || latest.versions[0].version_id !== versionId ||
          latest.versions[0].percentage !== 100) throw new Error("Expected version is not serving 100% of traffic");
      const get = async (path) => {
        const response = await fetcher(`https://f.webbx.space${path}${path.includes("?") ? "&" : "?"}commit=${marker.commit}`,
          { cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`Public verification: HTTP ${response.status}`);
        return response;
      };
      const liveMarker = await (await get("/deployment.json")).json();
      if (JSON.stringify(liveMarker) !== JSON.stringify(marker)) throw new Error("Public deployment marker differs");
      const meta = `<meta name="deployment-sha" content="${marker.commit}">`;
      const home = await (await get("/")).text();
      const report = await (await get(marker.reportPath)).text();
      if (!home.includes(meta) || !home.includes(`href="reports/${marker.reportId}"`) || !report.includes(meta)) {
        throw new Error("Homepage/report not yet serving the expected commit");
      }
      if (marker.marketStatus === "unavailable" && !report.includes('data-market-status="unavailable"')) {
        throw new Error("Report missing market failure disclosure");
      }
      console.log(`Verified homepage, report, commit ${marker.commit}, Worker version ${versionId}`);
      return;
    } catch {
      if (attempt === attempts - 1) throw new Error("Publication verification failed; retry workflow without refreshing market data");
      await pause(5000);
    }
  }
}
