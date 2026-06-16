// ─────────────────────────────────────────────────────────────
// @node-i3x/opcua-connector — certificate management
// ─────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ILogger } from '@node-i3x/core';
import { OPCUACertificateManager } from 'node-opcua-certificate-manager';

/** Options needed by the certificate manager factory. */
export interface CertificateManagerOptions {
  endpointUrl: string;
  applicationName: string;
  applicationUri?: string;
  pkiFolder?: string;
  certificateSubject?: string;
}

/**
 * Create a dedicated `OPCUACertificateManager` for a client
 * instance.  Uses a unique PKI folder derived from the
 * endpoint URL hash to avoid contention when multiple bridge
 * processes run concurrently.
 *
 * The certificate manager is initialised and, if no client
 * certificate exists yet, a self-signed certificate with
 * proper OPC UA shape is created automatically.
 */
export async function createCertificateManager(
  opts: CertificateManagerOptions,
  logger: ILogger,
): Promise<OPCUACertificateManager> {
  const hash = crypto
    .createHash('sha256')
    .update(opts.endpointUrl)
    .digest('hex')
    .slice(0, 12);

  const pkiFolder = opts.pkiFolder ?? path.join(process.cwd(), 'pki', `i3x-${hash}`);

  const certificateManager = new OPCUACertificateManager({
    rootFolder: pkiFolder,
    automaticallyAcceptUnknownCertificate: true,
    name: 'PKI',
    keySize: 2048,
  });

  await certificateManager.initialize();

  // ── Create self-signed certificate if missing ──────────
  await ensureSelfSignedCertificate(certificateManager, opts, pkiFolder, hash, logger);

  return certificateManager;
}

/**
 * Create a self-signed certificate with the correct OPC UA
 * shape if one does not already exist in the PKI folder.
 *
 * The certificate includes:
 * - `applicationUri` in the Subject Alternative Name (SAN)
 * - X.500 subject with CN = applicationName-hash
 * - DNS hostname in the SAN
 * - 10-year validity
 */
async function ensureSelfSignedCertificate(
  certificateManager: OPCUACertificateManager,
  opts: CertificateManagerOptions,
  pkiFolder: string,
  hash: string,
  logger: ILogger,
): Promise<void> {
  const certFile = path.join(pkiFolder, 'PKI', 'own', 'certs', 'client_certificate.pem');

  if (fs.existsSync(certFile)) {
    logger.debug(`Client certificate exists: ${certFile}`);
    return;
  }

  const hostname = os.hostname();
  const applicationUri = opts.applicationUri ?? `urn:${hostname}:${opts.applicationName}`;

  await certificateManager.createSelfSignedCertificate({
    applicationUri,
    subject:
      opts.certificateSubject ??
      `/CN=${opts.applicationName}-${hash}/O=Sterfive/L=Orleans/C=FR`,
    dns: [hostname],
    startDate: new Date(),
    validity: 365 * 10, // 10 years
  });

  logger.info(`Created self-signed client certificate: ${certFile}`);
}
