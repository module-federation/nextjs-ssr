const users = require("./user.json");
const alreadyAdded = require("./updated.json");
const fs = require("fs");

const cache = new Set();
alreadyAdded.forEach((user) => {
  if (user.Username && user.granted) {
    cache.add(user.Username);
  }
});

const done = users
  .map((user, index) => {
    if (!cache.has(user.Username)) {
      const fetchRequest = import("node-fetch")
        .then((mod) => {
          return new Promise((res) => {
            setTimeout(() => {
              res(mod.default);
            }, 200 * index);
          });
        })
        .then((fetch) => {
          return fetch(
            "https://api.privjs.com/access?packageName=@module-federation/nextjs-ssr",
            {
              method: "POST",
              body: JSON.stringify({
                userEmail: user.Username,
              }),
              headers: {
                key: "a1bz6148-929u-4ei9-8afd-d79ce2149k7a",
                secret:
                  "kifaJ04FAXalExkgk08zdI2i4MVXrisjN2wqM3fm6ZSGcnY2ZNUiy9WgywFjQngZ",
                "content-type": "application/json",
              },
            }
          ).then((res) => {
            console.log(res);
            user.granted = true;
            cache.add(user.Username);
            return user;
          });
        });
      return fetchRequest;
    }
  })
  .filter((i) => !!i);
Promise.all(done).then((useradded) => {
  const additional = Array.from(cache).map((item) => {
    return {
      Username: item,
      granted: true,
    };
  });

  fs.writeFileSync(
    "./updated.json",
    JSON.stringify([...additional, ...useradded], null, 2)
  );
});
