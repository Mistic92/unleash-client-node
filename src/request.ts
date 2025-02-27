import * as fetch from 'make-fetch-happen';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { CustomHeaders } from './headers';
import { HttpOptions } from './http-options';

export interface RequestOptions {
  url: string;
  timeout?: number;
  headers?: CustomHeaders;
}

export interface GetRequestOptions extends RequestOptions {
  etag?: string;
  appName?: string;
  instanceId?: string;
  httpOptions?: HttpOptions;
}

export interface Data {
  [key: string]: any;
}

export interface PostRequestOptions extends RequestOptions {
  json: Data;
  appName?: string;
  instanceId?: string;
  httpOptions?: HttpOptions;
}
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30 * 1000,
  timeout: 10 * 1000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30 * 1000,
  timeout: 10 * 1000,
});
 
export const getAgent = (url: URL) => (url.protocol === 'https:' ? httpsAgent : httpAgent);
export const buildHeaders = (
  appName: string | undefined,
  instanceId: string | undefined,
  etag: string | undefined,
  contentType: string | undefined,
  custom: CustomHeaders | undefined,
): Record<string, string> => {
  const head: Record<string, string> = {};
  if (appName) {
    head['UNLEASH-APPNAME'] = appName;
    head['User-Agent'] = appName;
  }
  if (instanceId) {
    head['UNLEASH-INSTANCEID'] = instanceId;
  }
  if (etag) {
    head['If-None-Match'] = etag;
  }
  if (contentType) {
    head['Content-Type'] = contentType;
  }
  if (custom) {
    Object.assign(head, custom);
  }
  return head;
};

export const post = ({
  url,
  appName,
  timeout,
  instanceId,
  headers,
  json,
  httpOptions,
}: PostRequestOptions) =>
  fetch(url, {
    timeout: timeout || 10000,
    method: 'POST',
    agent: getAgent,
    headers: buildHeaders(appName, instanceId, undefined, 'application/json', headers),
    body: JSON.stringify(json),
    strictSSL: httpOptions?.rejectUnauthorized,
  });

export const get = ({
  url,
  etag,
  appName,
  timeout,
  instanceId,
  headers,
  httpOptions,
}: GetRequestOptions) =>
  fetch(url, {
    method: 'GET',
    timeout: timeout || 10000,
    agent: getAgent,
    headers: buildHeaders(appName, instanceId, etag, undefined, headers),
    retry: {
      retries: 2,
    },
    strictSSL: httpOptions?.rejectUnauthorized,
  });
