/* Tiny promise, easy to understand */
class P {
  constructor(fn) {
    this.value = void 0;
    this.state = "pending";
    this.resolves = [];
    this.rejectes = [];

    const resolve = data => {
      if (data instanceof P) {
        P.captureError.remove(data); // remove from unhaddlePromise list
        return data.then(resolve, reject);
      }

      if (this.state !== "pending") return;
      this.state = "resolved";
      this.value = data;
      this.resolves.forEach(fn => fn(this.value));
    };

    const reject = data => {
      if (this.state !== "pending") return;
      this.state = "rejected";
      this.value = data;
      this.rejectes.forEach(fn => fn(this.value));
      P.captureError(this);
    };

    try {
      fn(resolve, reject);
    } catch (e) {
      reject(`Error ${e.message}`);
    }
  }

  then(ok = P.transfer, fail = P.transfer) {
    let _resolve, _reject;
    const thenP = new P(function(resolve, reject) {
      _resolve = resolve;
      _reject = reject;
    });

    if (this.state === "resolved") {
      asyncResolve(this.value, ok, _resolve, _reject);
    }

    if (this.state === "rejected") {
      const failResolve = fail === P.transfer ? _reject : _resolve;
      asyncResolve(this.value, fail, failResolve, _reject);
    }

    if (this.state === "pending") {
      this.resolves.push(() => {
        asyncResolve(this.value, ok, _resolve, _reject);
      });
      this.rejectes.push(() => {
        const failResolve = fail === P.transfer ? _reject : _resolve;
        asyncResolve(this.value, fail, failResolve, _reject);
      });
    }

    return thenP;
  }

  catch(haddle) {
    return this.then(null, haddle);
  }

  static resolve = value => new P(res => res(value));

  static reject = value => new P((res, rej) => rej(value));

  // pass origin value to thenPromise without haddler
  static transfer = value => value;

  // mock notify Promise Error
  static captureError = (() => {
    const unhaddlePromises = [];

    function captureError(promise) {
      if (promise.rejectes.length) return;
      unhaddlePromises.push(promise);

      callInMacroTurn(() => {
        unhaddlePromises.forEach(promise =>
          console.error(`Uncaught Promise ${promise.value}`)
        );
        unhaddlePromises.length = 0;
      });
    }

    captureError.remove = promise => {
      const index = unhaddlePromises.indexOf(promise);
      unhaddlePromises.splice(index, 1);
    };

    return captureError;
  })();
}

/**
 * 模拟浏览器和node环境下的微任务调用
 * @param {需要加入微任务的回调} cb
 */
function callInMacroTurn(cb) {
  const gob = (() => this)();
  if (gob.process && process.nextTick) return process.nextTick(cb);

  const observer = new MutationObserver(cb);
  const target = document.createElement("span");
  observer.observe(target, { attributes: true });
  target.setAttribute("dispatchMutation", Date.now());

  return observer;
}

/**
 * 以微任务的方式更改thenPromise的状态
 * @param {需要then方法处理的数据} value
 * @param {调用then方法的那个回调处理数据} haddler
 * @param {改变thenPromise状态的回调，传入时确定} resolve
 * @param {haddler执行出错时统一置错} reject
 */
function asyncResolve(value, haddler, resolve, reject) {
  callInMacroTurn(() => {
    try {
      resolve(haddler(value));
    } catch (e) {
      reject(`Error ${e.message}`);
    }
  });
}

/**
 * 测试脚本，检验手动实现与原生方法的区别
 */
(function() {
  const gob = (() => this)();

  t(P);
  t(Promise);

  function t(C) {
    const sign = C.name;
    const log = console.log.bind(console, sign);
    const time = gob.performance
      ? () => performance.now()
      : gob.process
      ? () => process.hrtime()[1]
      : () => Date.now();

    (() => {
      var t = time();

      C.reject(1234);

      new C((a, b) => {
        const n = time();
        log("new", n - t);
        t = n;
        a(124);
      })
        .then(res => {
          const n = time();
          log("then.1", res, n - t);
          t = n;
          throw new Error("111");
        })
        .catch(e => {
          const n = time();
          log("catch.1", n - t);
          t = n;
          return C.reject(222);
        })
        .catch(p => {
          return new C((res, rej) => {
            setTimeout(() => {
              rej(p);
            }, 1200);
          });
        })
        .then()
        .catch(e => {
          const n = time();
          log("catch.2", n - t);
          t = n;
          throw new Error("121");
        });

      (function() {
        const n = time();
        log("console", n - t);
        t = n;
      })();

      setTimeout(() => {
        const n = time();
        log("timeout", n - t);
        t = n;
      });
    })();
  }
})();
