/**
 * Global ECMAScript polyfills for older browser engines and preview WebViews
 * Provides Object.hasOwn (ES2022) to prevent crashes in dependencies like otpauth.
 */

if (typeof Object.hasOwn !== 'function') {
  Object.defineProperty(Object, 'hasOwn', {
    value: function (object: any, property: PropertyKey): boolean {
      if (object == null) {
        throw new TypeError('Cannot convert undefined or null to object');
      }
      return Object.prototype.hasOwnProperty.call(Object(object), property);
    },
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

export {};
