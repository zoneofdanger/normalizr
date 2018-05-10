import * as ImmutableUtils from './ImmutableUtils';

const getDefaultGetId = (idAttribute) => (input) =>
  ImmutableUtils.isImmutable(input) ? input.get(idAttribute) : input[idAttribute];

export default class EntitySchema {
  constructor(key, definition = {}, options = {}) {
    if (!key || typeof key !== 'string') {
      throw new Error(`Expected a string key for Entity, but found ${key}.`);
    }

    const {
      idAttribute = 'id',
      mergeStrategy = (entityA, entityB) => {
        return { ...entityA, ...entityB };
      },
      processStrategy = (input) => ({ ...input })
    } = options;

    this._key = key;
    this._getId = typeof idAttribute === 'function' ? idAttribute : getDefaultGetId(idAttribute);
    this._idAttribute = idAttribute;
    this._mergeStrategy = mergeStrategy;
    this._processStrategy = processStrategy;
    this.define(definition);
  }

  get key() {
    return this._key;
  }

  get idAttribute() {
    return this._idAttribute;
  }

  // https://github.com/moll/json-stringify-safe/blob/master/stringify.js
  stringifySafe(input, replacer, spaces, cycleReplacer) {
    function serializer(replacer, cycleReplacer) {
      const stack = [];
      const keys = [];

      if (!cycleReplacer) {
        cycleReplacer = (key, value) => {
          if (stack[0] === value) {
            return '[Circular ~]';
          }
          return '[Circular ~.' + keys.slice(0, stack.indexOf(value)).join('.') + ']';
        };
      }

      return (key, value) => {
        if (stack.length > 0) {
          let thisPos = stack.indexOf(this);
          ~thisPos ? stack.splice(thisPos + 1) : stack.push(this);
          ~thisPos ? keys.splice(thisPos, Infinity, key) : keys.push(key);
          if (~stack.indexOf(value)) {
            value = cycleReplacer.call(this, key, value);
          }
        } else {
          stack.push(value);
        }

        return !replacer ? value : replacer.call(this, key, value);
      };
    }

    return JSON.stringify(input, serializer(replacer, cycleReplacer), spaces);
  }

  define(definition) {
    this.schema = Object.keys(definition).reduce((entitySchema, key) => {
      const schema = definition[key];
      return { ...entitySchema, [key]: schema };
    }, this.schema || {});
  }

  getId(input, parent, key) {
    return this._getId(input, parent, key);
  }

  merge(entityA, entityB) {
    return this._mergeStrategy(entityA, entityB);
  }

  normalize(input, parent, key, visit, addEntity, visitedEntities) {
    const stringifiedInput = this.stringifySafe(input);
    if (visitedEntities[stringifiedInput]) {
      return this.getId(input, parent, key);
    }
    visitedEntities[stringifiedInput] = true;

    const processedEntity = this._processStrategy(input, parent, key);
    Object.keys(this.schema).forEach((key) => {
      if (processedEntity.hasOwnProperty(key) && typeof processedEntity[key] === 'object') {
        const schema = this.schema[key];
        processedEntity[key] = visit(processedEntity[key], processedEntity, key, schema, addEntity, visitedEntities);
      }
    });

    addEntity(this, processedEntity, input, parent, key);
    return this.getId(input, parent, key);
  }

  denormalize(entity, unvisit) {
    if (ImmutableUtils.isImmutable(entity)) {
      return ImmutableUtils.denormalizeImmutable(this.schema, entity, unvisit);
    }

    Object.keys(this.schema).forEach((key) => {
      if (entity.hasOwnProperty(key)) {
        const schema = this.schema[key];
        entity[key] = unvisit(entity[key], schema);
      }
    });
    return entity;
  }
}
