import { EventEmitter } from 'events';
import { Storage } from './storage';
import { FeatureInterface } from './feature';
import { get } from './request';
import { CustomHeaders, CustomHeadersFunction } from './headers';
import getUrl from './url-utils';
import { HttpOptions } from './http-options';
import { TagFilter } from './tags';

export type StorageImpl = typeof Storage;

export interface RepositoryInterface extends EventEmitter {
  getToggle(name: string): FeatureInterface;
  getToggles(): FeatureInterface[];
  stop(): void;
}
export interface RepositoryOptions {
  backupPath: string;
  url: string;
  appName: string;
  instanceId: string;
  projectName?: string;
  refreshInterval?: number;
  StorageImpl?: StorageImpl;
  timeout?: number;
  headers?: CustomHeaders;
  customHeadersFunction?: CustomHeadersFunction;
  httpOptions?: HttpOptions;
  namePrefix?: string;
  tags?: Array<TagFilter>;
}

export default class Repository extends EventEmitter implements EventEmitter {
  private timer: NodeJS.Timer | undefined;

  private url: string;

  private storage: Storage;

  private etag: string | undefined;

  private appName: string;

  private instanceId: string;

  private refreshInterval?: number;

  private headers?: CustomHeaders;

  private customHeadersFunction?: CustomHeadersFunction;

  private timeout?: number;

  private stopped = false;

  private projectName?: string;

  private httpOptions?: HttpOptions;

  private readonly namePrefix?: string;

  private readonly tags?: Array<TagFilter>;

  constructor({
    backupPath,
    url,
    appName,
    instanceId,
    projectName,
    refreshInterval,
    StorageImpl = Storage,
    timeout,
    headers,
    customHeadersFunction,
    httpOptions,
    namePrefix,
    tags,
  }: RepositoryOptions) {
    super();
    this.url = url;
    this.refreshInterval = refreshInterval;
    this.instanceId = instanceId;
    this.appName = appName;
    this.projectName = projectName;
    this.headers = headers;
    this.timeout = timeout;
    this.customHeadersFunction = customHeadersFunction;
    this.httpOptions = httpOptions;
    this.namePrefix = namePrefix;
    this.tags = tags;

    this.storage = new StorageImpl({ backupPath, appName });
    this.storage.on('error', (err) => this.emit('error', err));
    this.storage.on('ready', () => this.emit('ready'));

    process.nextTick(() => this.fetch());
  }

  timedFetch() {
    if (this.refreshInterval != null && this.refreshInterval > 0) {
      this.timer = setTimeout(() => this.fetch(), this.refreshInterval);
      if (process.env.NODE_ENV !== 'test' && typeof this.timer.unref === 'function') {
        this.timer.unref();
      }
    }
  }

  validateFeature(feature: FeatureInterface) {
    const errors: string[] = [];
    if (!Array.isArray(feature.strategies)) {
      errors.push(`feature.strategies should be an array, but was ${typeof feature.strategies}`);
    }

    if (feature.variants && !Array.isArray(feature.variants)) {
      errors.push(`feature.variants should be an array, but was ${typeof feature.variants}`);
    }

    if (typeof feature.enabled !== 'boolean') {
      errors.push(`feature.enabled should be an boolean, but was ${typeof feature.enabled}`);
    }

    if (errors.length > 0) {
      const err = new Error(errors.join(', '));
      this.emit('error', err);
    }
  }

  async fetch() {
    if (this.stopped) {
      return;
    }

    try {
      let mergedTags;
      if (this.tags) { 
        mergedTags = this.mergeTagsToStringArray(this.tags);
      }
      const url = getUrl(this.url, this.projectName, this.namePrefix, mergedTags);

      const headers = this.customHeadersFunction
        ? await this.customHeadersFunction()
        : this.headers;

      const res = await get({
        url,
        etag: this.etag,
        appName: this.appName,
        timeout: this.timeout,
        instanceId: this.instanceId,
        headers,
        httpOptions: this.httpOptions,
      });

      if (res.status === 304) {
        // No new data
        this.emit('unchanged');
      } else if (!res.ok) {
        this.emit('error', new Error(`Response was not statusCode 2XX, but was ${res.status}`));
      } else {
        try {
          const data: any = await res.json();
          const obj = data.features.reduce(
            (o: { [s: string]: FeatureInterface }, feature: FeatureInterface) => {
              const a = { ...o };
              this.validateFeature(feature);
              a[feature.name] = feature;
              return a;
            },
            {} as { [s: string]: FeatureInterface },
          );
          this.storage.reset(obj);
          if (res.headers.get('etag') !== null) {
            this.etag = res.headers.get('etag') as string;
          } else {
            this.etag = undefined;
          }
          this.emit('changed', this.storage.getAll());
        } catch (err) {
          this.emit('error', err);
        }
      }
    } catch (err) {
      this.emit('error', err);
    } finally {
      this.timedFetch();
    }
  }

  mergeTagsToStringArray(tags: Array<TagFilter>): Array<string> {
    return tags.map((tag) => `${tag.tagName}:${tag.tagValue}`);
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.removeAllListeners();
    this.storage.removeAllListeners();
  }

  getToggle(name: string): FeatureInterface {
    return this.storage.get(name);
  }

  getToggles(): FeatureInterface[] {
    const toggles = this.storage.getAll();
    return Object.keys(toggles).map((key) => toggles[key]);
  }
}
