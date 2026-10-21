import {offersEnabled,authorizeProduction} from '../src/runtime.mjs';
import {randomUUID} from 'node:crypto';
import {snapshotBrief,briefHash} from '../src/bhs/brief.mjs';
import {interactionId,modelText} from '../src/bhs/provider.mjs';
import {createPricingProof,digest} from '../src/pricing/proof.mjs';
import {logoProof} from '../src/proposal/logo-proof.mjs';
import {normalizePlan,compositionHash} from '../src/proposal/composition.mjs';
import {proposalEngine} from '../src/engines/proposal-engine.mjs';
import {assertResult} from '../src/contracts.mjs';
import {offerGeminiKey} from '../src/config.mjs';
export function createProposalHandler({getProvider=null,getSecret=offerGeminiKey,now=Date.now}={}){
 const starts=new Map();
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(!offersEnabled())return res.status(503).json({error:'Teklif servisi yalnızca korumalı önizlemede açık.'});
  if(req.method==='GET')return res.status(200).json({configured:Boolean(getSecret()),provider:'Gemini',pricesFrom:'pricing-engine',logoFrom:'logo-engine',customerAlternatives:2});
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  const host=req.headers.host;if(!host||req.headers.origin!=='https://'+host)return res.status(403).json({error:'İstek kaynağı doğrulanamadı.'});
  try{
    await authorizeProduction(req);
   if(Number(req.headers['content-length'])>4200000)throw Error();
   const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!body||JSON.stringify(body).length>4200000)throw Error();
   const brief=snapshotBrief(body.brief),hash=briefHash(brief),secret=getSecret(),codec=createPricingProof(secret);
   const session=(req.headers.cookie||'').match(/(?:^|;\s*)__Host-offer-research=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];if(!session)throw Error();
   const approval=codec.decode(body.proposalProof,session,host,now());
   if(approval.kind!=='pricing_ready'||approval.briefHash!==hash||approval.auditHash!==digest(body.audit)||approval.pricingHash!==digest(body.pricing))throw Error();
   assertResult('audit',body.audit);assertResult('pricing',body.pricing);
   const {logoProof:receipt,...logoData}=body.logo||{};logoProof(secret,host,logoData,receipt);
   const logo={stage:'logo',status:'review',data:logoData};assertResult('logo',logo);
   const context={leadId:body.context?.leadId,spaceId:body.context?.spaceId};
   if(Object.values(context).some(v…22351 tokens truncated…    "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-libvips-linuxmusl-x64": {
      "version": "1.3.4",
      "resolved": "https://registry.npmjs.org/@img/sharp-libvips-linuxmusl-x64/-/sharp-libvips-linuxmusl-x64-1.3.4.tgz",
      "integrity": "sha512-6zXKeE/p39I1AmA3cJG35eyBGNqNddLnUXjhwBnsGjFPWqf5VKkDBEqaEkPDoTEtkxwi2vv8Tcr2mDyP4So7Fg==",
      "cpu": [
        "x64"
      ],
      "license": "LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "linux"
      ],
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-linux-arm": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-arm/-/sharp-linux-arm-0.35.5.tgz",
      "integrity": "sha512-LEaXK2WdXVK5ykcw0buWyPMsmLLL2vpHLD6yrNSW+JGEL3BZPA4tpKN6iaMc4AxTTAoaX/sU1rOL51lcIz48ZQ==",
      "cpu": [
        "arm"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-arm": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linux-arm64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-arm64/-/sharp-linux-arm64-0.35.5.tgz",
      "integrity": "sha512-LYVx5JTsOM2CBzmxreh+nl64/3H6Xb09iSLknqH47z2T2DFFxDeFLP5y4dJwe6H7uGQlHPyEEtIqyo3DYsRwdQ==",
      "cpu": [
        "arm64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-arm64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linux-ppc64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-ppc64/-/sharp-linux-ppc64-0.35.5.tgz",
      "integrity": "sha512-QVxAAq8evVRI9ia2vqgwrmWucn5Dfv+JdWzj75pD8omHLPSP7f8p20O8jxzjCcuCEQEOtYOZUmX1hkiZ0kdevA==",
      "cpu": [
        "ppc64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-ppc64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linux-riscv64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-riscv64/-/sharp-linux-riscv64-0.35.5.tgz",
      "integrity": "sha512-LtdreXguaavKODPIfzJ4kffx7UNt1omwtK0rch4EBbbSTXPnxWmYSayXdLJw0fJzQ97kHt1gL/yh4tvU+nCyRQ==",
      "cpu": [
        "riscv64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-riscv64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linux-s390x": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-s390x/-/sharp-linux-s390x-0.35.5.tgz",
      "integrity": "sha512-UZasTOFiYzotTsGOCu42BfUzP6Tu6Do/947iRm1RsLKvlllxwGcn4RN27LibGWceix4Y+Pmw3jsnTcCQIgWjqA==",
      "cpu": [
        "s390x"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-s390x": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linux-x64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linux-x64/-/sharp-linux-x64-0.35.5.tgz",
      "integrity": "sha512-SxFtLTeJInhAA9Q836kux2vZNeOBQEx658qvbboZScr0wIARym3IcGmW7KpVD5sbVg0Ojy+udFQdayYIZyoNog==",
      "cpu": [
        "x64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linux-x64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linuxmusl-arm64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linuxmusl-arm64/-/sharp-linuxmusl-arm64-0.35.5.tgz",
      "integrity": "sha512-9HbMclmI1zlNkFRs3z9/eBtDjfD0sGlrX1z6b1qwmiFY5ElDLh4BC0LPBdVp7z1DXFiKlIcznf+ZlsuZzLxQqg==",
      "cpu": [
        "arm64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linuxmusl-arm64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-linuxmusl-x64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-linuxmusl-x64/-/sharp-linuxmusl-x64-0.35.5.tgz",
      "integrity": "sha512-4KOphqB035HrVdqLZfCgMzzERrQkkzOwRhl4OAkRO1YCldbaFjySXMaK534Mo0V+LndnlJk+sbUyLeU0ULyD1A==",
      "cpu": [
        "x64"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "os": [
        "linux"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-libvips-linuxmusl-x64": "1.3.4"
      }
    },
    "node_modules/@img/sharp-wasm32": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-wasm32/-/sharp-wasm32-0.35.5.tgz",
      "integrity": "sha512-Ptsga1su4tQx+LLF1ECS9U6nz5kmrXKo6XVbtR48Ke3ZRxxgaWBu7IDtEe1quo8hiupwm6WFqxVlXaSf7IINGQ==",
      "license": "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
      "optional": true,
      "dependencies": {
        "@emnapi/runtime": "^1.11.3"
      },
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-webcontainers-wasm32": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-webcontainers-wasm32/-/sharp-webcontainers-wasm32-0.35.5.tgz",
      "integrity": "sha512-hfhF/FmoQyTUkA0bIKFOtw536BQSeBMe6BF6QyWlrPxT754+TFLaZ7sKKTfvvM0yJgKgaYTwnFCIZ/GuDw5SUA==",
      "cpu": [
        "wasm32"
      ],
      "license": "Apache-2.0",
      "optional": true,
      "dependencies": {
        "@img/sharp-wasm32": "0.35.5"
      },
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-win32-arm64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-win32-arm64/-/sharp-win32-arm64-0.35.5.tgz",
      "integrity": "sha512-X4t7g+7ZA5DKblCBEXGjUqqemj4vczING/5viFwAL8h4N3qYeyjwdCvRLHi4EdOUI+2Z7UFlp1VM+p/AuEtm6Q==",
      "cpu": [
        "arm64"
      ],
      "license": "Apache-2.0 AND LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-win32-ia32": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-win32-ia32/-/sharp-win32-ia32-0.35.5.tgz",
      "integrity": "sha512-5Zm82LoBc43nhwNybZlG7Y1KO//Zhsn306fQl29ZOuStHLGTo3BWL83q3cznX0poxSAMuYL1On/BHBxkBeKr6A==",
      "cpu": [
        "ia32"
      ],
      "license": "Apache-2.0 AND LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": "^20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@img/sharp-win32-x64": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/@img/sharp-win32-x64/-/sharp-win32-x64-0.35.5.tgz",
      "integrity": "sha512-x76eH0vEiHlcMQu8Y8IenntaACtddpT6W0wmXtWrnKcnKI7ME5DdgqhAD6SEWOEl1v2zDvkZDhFA9KnURwpfqg==",
      "cpu": [
        "x64"
      ],
      "license": "Apache-2.0 AND LGPL-3.0-or-later",
      "optional": true,
      "os": [
        "win32"
      ],
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      }
    },
    "node_modules/@sparticuz/chromium": {
      "version": "153.0.0",
      "resolved": "https://registry.npmjs.org/@sparticuz/chromium/-/chromium-153.0.0.tgz",
      "integrity": "sha512-jiGWqSvPMdu4+P9TilYqAR7yEGPEHINx+lCvE/NqNO/EHYzF/x1hUiI5T6ioVIt7dEy7n88byyT0vk+dnsgQwA==",
      "license": "MIT",
      "dependencies": {
        "tar-fs": "^3.1.2"
      },
      "engines": {
        "node": "^22.17.0 || >=24.0.0"
      }
    },
    "node_modules/b4a": {
      "version": "1.9.0",
      "resolved": "https://registry.npmjs.org/b4a/-/b4a-1.9.0.tgz",
      "integrity": "sha512-dpfcF9fDNR6++cthXR67iyhgqWy9CBouAvIWhIntzBG6cvK/cnIPiZQjBwi/ZqjjBEDGfoNDtmB0kTjroOJ3pQ==",
      "license": "Apache-2.0",
      "peerDependencies": {
        "react-native-b4a": "*"
      },
      "peerDependenciesMeta": {
        "react-native-b4a": {
          "optional": true
        }
      }
    },
    "node_modules/bare-events": {
      "version": "2.9.2",
      "resolved": "https://registry.npmjs.org/bare-events/-/bare-events-2.9.2.tgz",
      "integrity": "sha512-AIPKioV7/Y/8KfZ3AAhjPJxLLbY49S64Ym5DakZlUg75qQiTgUq9hEJoEwa4eUezPUlXRy/i5NpsKvo9jgKmoA==",
      "license": "Apache-2.0",
      "peerDependencies": {
        "bare-abort-controller": "*"
      },
      "peerDependenciesMeta": {
        "bare-abort-controller": {
          "optional": true
        }
      }
    },
    "node_modules/bare-fs": {
      "version": "4.8.4",
      "resolved": "https://registry.npmjs.org/bare-fs/-/bare-fs-4.8.4.tgz",
      "integrity": "sha512-MPC2eyrpbk3A873sK4y6rk+Iv4o2enxTjHZ8zH3HO0mjrpm5XjnguY2XmfidIsDV6vnjpbMBKUAJpV0ISD2SsQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "bare-events": "^2.5.4",
        "bare-path": "^3.0.0",
        "bare-stream": "^2.6.4",
        "bare-url": "^2.2.2",
        "fast-fifo": "^1.3.2"
      },
      "engines": {
        "bare": ">=1.28.0"
      },
      "peerDependencies": {
        "bare-buffer": "*"
      },
      "peerDependenciesMeta": {
        "bare-buffer": {
          "optional": true
        }
      }
    },
    "node_modules/bare-path": {
      "version": "3.1.2",
      "resolved": "https://registry.npmjs.org/bare-path/-/bare-path-3.1.2.tgz",
      "integrity": "sha512-ZyKbsuuqK6Ag0K8pX6V5Txq6XeJRvY+wXucnFGRjiyVYP9YWDpIQugk/b+enRYrEYBJaqLzghRQpXPMR7341Nw==",
      "license": "Apache-2.0"
    },
    "node_modules/bare-stream": {
      "version": "2.13.4",
      "resolved": "https://registry.npmjs.org/bare-stream/-/bare-stream-2.13.4.tgz",
      "integrity": "sha512-PcrQ8lVLbiJscNm1Kez+Yp4Gy4AHGcN1lzwjvf5NybWen7VvEgUfyfnXYJ2zNqWnzOfCb1Abq6lH8ti0syQszA==",
      "license": "Apache-2.0",
      "dependencies": {
        "b4a": "^1.8.1",
        "streamx": "^2.25.0",
        "teex": "^1.0.1"
      },
      "peerDependencies": {
        "bare-abort-controller": "*",
        "bare-buffer": "*",
        "bare-events": "*"
      },
      "peerDependenciesMeta": {
        "bare-abort-controller": {
          "optional": true
        },
        "bare-buffer": {
          "optional": true
        },
        "bare-events": {
          "optional": true
        }
      }
    },
    "node_modules/bare-url": {
      "version": "2.5.5",
      "resolved": "https://registry.npmjs.org/bare-url/-/bare-url-2.5.5.tgz",
      "integrity": "sha512-iM9qJCruvpt2rPaLsrumVDru9pogI7PHziHIa9kTNRFt8C8HuSa+kI9kFezK+NvHEFnnz71rKGZ1EAilq/3V/Q==",
      "license": "Apache-2.0",
      "dependencies": {
        "bare-path": "^3.0.0"
      }
    },
    "node_modules/detect-libc": {
      "version": "2.1.2",
      "resolved": "https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz",
      "integrity": "sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==",
      "license": "Apache-2.0",
      "engines": {
        "node": ">=8"
      }
    },
    "node_modules/end-of-stream": {
      "version": "1.4.5",
      "resolved": "https://registry.npmjs.org/end-of-stream/-/end-of-stream-1.4.5.tgz",
      "integrity": "sha512-ooEGc6HP26xXq/N+GCGOT0JKCLDGrq2bQUZrQ7gyrJiZANJ/8YDTxTpQBXGMn+WbIQXNVpyWymm7KYVICQnyOg==",
      "license": "MIT",
      "dependencies": {
        "once": "^1.4.0"
      }
    },
    "node_modules/events-universal": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/events-universal/-/events-universal-1.0.1.tgz",
      "integrity": "sha512-LUd5euvbMLpwOF8m6ivPCbhQeSiYVNb8Vs0fQ8QjXo0JTkEHpz8pxdQf0gStltaPpw0Cca8b39KxvK9cfKRiAw==",
      "license": "Apache-2.0",
      "dependencies": {
        "bare-events": "^2.7.0"
      }
    },
    "node_modules/fast-fifo": {
      "version": "1.3.2",
      "resolved": "https://registry.npmjs.org/fast-fifo/-/fast-fifo-1.3.2.tgz",
      "integrity": "sha512-/d9sfos4yxzpwkDkuN7k2SqFKtYNmCTzgfEpz82x34IM9/zc8KGxQoXg1liNC/izpRM/MBdt44Nmx41ZWqk+FQ==",
      "license": "MIT"
    },
    "node_modules/ipaddr.js": {
      "version": "2.5.0",
      "resolved": "https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-2.5.0.tgz",
      "integrity": "sha512-aq+t5NAc+cS6rZQQVWC2x98CPqGtKKTMDd4Gaodv0wShnItdKg/51djkGJ1hqH+Oy0ivDftCbSLCQob8zso01w==",
      "license": "MIT",
      "engines": {
        "node": ">= 10"
      }
    },
    "node_modules/once": {
      "version": "1.4.0",
      "resolved": "https://registry.npmjs.org/once/-/once-1.4.0.tgz",
      "integrity": "sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==",
      "license": "ISC",
      "dependencies": {
        "wrappy": "1"
      }
    },
    "node_modules/playwright-core": {
      "version": "1.64.1",
      "resolved": "https://registry.npmjs.org/playwright-core/-/playwright-core-1.64.1.tgz",
      "integrity": "sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==",
      "license": "Apache-2.0",
      "bin": {
        "playwright-core": "cli.js"
      },
      "engines": {
        "node": ">=20"
      }
    },
    "node_modules/pump": {
      "version": "3.0.4",
      "resolved": "https://registry.npmjs.org/pump/-/pump-3.0.4.tgz",
      "integrity": "sha512-VS7sjc6KR7e1ukRFhQSY5LM2uBWAUPiOPa/A3mkKmiMwSmRFUITt0xuj+/lesgnCv+dPIEYlkzrcyXgquIHMcA==",
      "license": "MIT",
      "dependencies": {
        "end-of-stream": "^1.1.0",
        "once": "^1.3.1"
      }
    },
    "node_modules/semver": {
      "version": "7.8.5",
      "resolved": "https://registry.npmjs.org/semver/-/semver-7.8.5.tgz",
      "integrity": "sha512-Y7/KDsb8LjooZpwaqGyulO6DQlksgCncchHGk+sZIY4SBvUocMBEFH5Ur1fI4dV+Jvl0w6cjvucaIi40puRioA==",
      "license": "ISC",
      "bin": {
        "semver": "bin/semver.js"
      },
      "engines": {
        "node": ">=10"
      }
    },
    "node_modules/sharp": {
      "version": "0.35.5",
      "resolved": "https://registry.npmjs.org/sharp/-/sharp-0.35.5.tgz",
      "integrity": "sha512-Ywn4OnzGukp7CDMrp08RQ50YKmuwG47brZgIVPTvBaaAfQlRlygrRqSrxdCiL9M+LlzLBiJ68IR1QqvzHyjC7g==",
      "license": "Apache-2.0",
      "dependencies": {
        "@img/colour": "^1.1.0",
        "detect-libc": "^2.1.2",
        "semver": "^7.8.5"
      },
      "engines": {
        "node": ">=20.9.0"
      },
      "funding": {
        "url": "https://opencollective.com/libvips"
      },
      "optionalDependencies": {
        "@img/sharp-darwin-arm64": "0.35.5",
        "@img/sharp-darwin-x64": "0.35.5",
        "@img/sharp-freebsd-wasm32": "0.35.5",
        "@img/sharp-libvips-darwin-arm64": "1.3.4",
        "@img/sharp-libvips-darwin-x64": "1.3.4",
        "@img/sharp-libvips-linux-arm": "1.3.4",
        "@img/sharp-libvips-linux-arm64": "1.3.4",
        "@img/sharp-libvips-linux-ppc64": "1.3.4",
        "@img/sharp-libvips-linux-riscv64": "1.3.4",
        "@img/sharp-libvips-linux-s390x": "1.3.4",
        "@img/sharp-libvips-linux-x64": "1.3.4",
        "@img/sharp-libvips-linuxmusl-arm64": "1.3.4",
        "@img/sharp-libvips-linuxmusl-x64": "1.3.4",
        "@img/sharp-linux-arm": "0.35.5",
        "@img/sharp-linux-arm64": "0.35.5",
        "@img/sharp-linux-ppc64": "0.35.5",
        "@img/sharp-linux-riscv64": "0.35.5",
        "@img/sharp-linux-s390x": "0.35.5",
        "@img/sharp-linux-x64": "0.35.5",
        "@img/sharp-linuxmusl-arm64": "0.35.5",
        "@img/sharp-linuxmusl-x64": "0.35.5",
        "@img/sharp-webcontainers-wasm32": "0.35.5",
        "@img/sharp-win32-arm64": "0.35.5",
        "@img/sharp-win32-ia32": "0.35.5",
        "@img/sharp-win32-x64": "0.35.5"
      },
      "peerDependenciesMeta": {
        "@types/node": {
          "optional": true
        }
      }
    },
    "node_modules/streamx": {
      "version": "2.28.1",
      "resolved": "https://registry.npmjs.org/streamx/-/streamx-2.28.1.tgz",
      "integrity": "sha512-zEzXb0s5Cds7tqMH6rhZ05lcJydCWiQPEwiNngVqzsxCc962vLY4Uw+mW7od8kDH258k2Uz/JrOkdIAAhSh9VA==",
      "license": "MIT",
      "dependencies": {
        "events-universal": "^1.0.0",
        "fast-fifo": "^1.3.2",
        "text-decoder": "^1.1.0"
      }
    },
    "node_modules/tar-fs": {
      "version": "3.1.3",
      "resolved": "https://registry.npmjs.org/tar-fs/-/tar-fs-3.1.3.tgz",
      "integrity": "sha512-/hU4AXnIdZu+Gvl1pk0oI5f5HxWsCJRtY2aFaJdk9VvyL48DWU6iU5WAIPG+wIi1YvWA6eTJvIviP/tMAZZNwQ==",
      "license": "MIT",
      "dependencies": {
        "pump": "^3.0.0",
        "tar-stream": "^3.1.5"
      },
      "optionalDependencies": {
        "bare-fs": "^4.0.1",
        "bare-path": "^3.0.0"
      }
    },
    "node_modules/tar-stream": {
      "version": "3.2.2",
      "resolved": "https://registry.npmjs.org/tar-stream/-/tar-stream-3.2.2.tgz",
      "integrity": "sha512-+8NeqHRjQWH9nYlwo2gamAMImZCVzI4UoEgDpWorBt9OEfppiZn+uSkskzQKPWIZyji/C8fpWO7u69G0DX0tbg==",
      "license": "MIT",
      "dependencies": {
        "b4a": "^1.9.0",
        "bare-fs": "^4.8.2",
        "fast-fifo": "^1.3.2",
        "streamx": "^2.28.1"
      }
    },
    "node_modules/teex": {
      "version": "1.0.1",
      "resolved": "https://registry.npmjs.org/teex/-/teex-1.0.1.tgz",
      "integrity": "sha512-eYE6iEI62Ni1H8oIa7KlDU6uQBtqr4Eajni3wX7rpfXD8ysFx8z0+dri+KWEPWpBsxXfxu58x/0jvTVT1ekOSg==",
      "license": "MIT",
      "dependencies": {
        "streamx": "^2.12.5"
      }
    },
    "node_modules/text-decoder": {
      "version": "1.2.7",
      "resolved": "https://registry.npmjs.org/text-decoder/-/text-decoder-1.2.7.tgz",
      "integrity": "sha512-vlLytXkeP4xvEq2otHeJfSQIRyWxo/oZGEbXrtEEF9Hnmrdly59sUbzZ/QgyWuLYHctCHxFF4tRQZNQ9k60ExQ==",
      "license": "Apache-2.0",
      "dependencies": {
        "b4a": "^1.6.4"
      }
    },
    "node_modules/tslib": {
      "version": "2.8.1",
      "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz",
      "integrity": "sha512-oJFu94HQb+KVduSUQL7wnpmqnfmLsOA/nAh6b6EH0wCEoK0/mPeXU6c3wKDV83MkOuHPRHtSXKKU99IBazS/2w==",
      "license": "0BSD",
      "optional": true
    },
    "node_modules/unpdf": {
      "version": "1.9.1",
      "resolved": "https://registry.npmjs.org/unpdf/-/unpdf-1.9.1.tgz",
      "integrity": "sha512-nO1npM2kNyd4hj1fKzUVU6bvnWjDSxI97eycM/DgzI83dYyW+pNRI9NeMQVEfef8fI3Q06i9lkMeE1HxrQqKoA==",
      "license": "MIT",
      "engines": {
        "node": ">=22"
      },
      "peerDependencies": {
        "@napi-rs/canvas": "^0.1.69 || ^1.0.0"
      },
      "peerDependenciesMeta": {
        "@napi-rs/canvas": {
          "optional": true
        }
      }
    },
    "node_modules/wrappy": {
      "version": "1.0.2",
      "resolved": "https://registry.npmjs.org/wrappy/-/wrappy-1.0.2.tgz",
      "integrity": "sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==",
      "license": "ISC"
    }
  }
}
