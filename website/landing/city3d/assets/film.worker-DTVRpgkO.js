var RS=Object.defineProperty;var PS=(Ji,cn,Nn)=>cn in Ji?RS(Ji,cn,{enumerable:!0,configurable:!0,writable:!0,value:Nn}):Ji[cn]=Nn;var F=(Ji,cn,Nn)=>PS(Ji,typeof cn!="symbol"?cn+"":cn,Nn);(function(){"use strict";/**
 * @license
 * Copyright 2010-2026 Three.js Authors
 * SPDX-License-Identifier: MIT
 */const cn={ROTATE:0,DOLLY:1,PAN:2},Nn={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},vd=0,Qc=1,_d=2,qs=1,Md=2,Zs=3,Mi=0,nn=1,qe=2,Ze=0,ji=1,Fn=2,th=3,eh=4,nh=5,Xn=100,yd=101,Sd=102,bd=103,wd=104,$s=200,Ad=201,Td=202,Ed=203,ih=204,sh=205,co=206,Cd=207,ho=208,Rd=209,Pd=210,Id=211,Ld=212,Dd=213,Ud=214,uo=0,fo=1,po=2,Ks=3,mo=4,go=5,xo=6,vo=7,_o=0,Nd=1,Fd=2,Yn=0,Mo=1,yo=2,So=3,Wr=4,bo=5,wo=6,Ao=7,rh="attached",zd="detached",ah=300,Fi=301,Qi=302,Xr=303,To=304,Yr=306,hn=1e3,bn=1001,qr=1002,Ue=1003,oh=1004,Js=1005,Ne=1006,Zr=1007,oi=1008,sn=1009,lh=1010,ch=1011,js=1012,Eo=1013,qn=1014,wn=1015,Je=1016,Co=1017,Ro=1018,ts=1020,hh=35902,uh=35899,fh=1021,dh=1022,gn=1023,li=1026,yi=1027,$r=1028,Po=1029,zi=1030,Io=1031,Lo=1033,Kr=33776,Jr=33777,jr=33778,Qr=33779,Do=35840,Uo=35841,No=35842,Fo=35843,zo=36196,Oo=37492,Bo=37496,ko=37488,Vo=37489,ta=37490,Ho=37491,Go=37808,Wo=37809,Xo=37810,Yo=37811,qo=37812,Zo=37813,$o=37814,Ko=37815,Jo=37816,jo=37817,Qo=37818,tl=37819,el=37820,nl=37821,il=36492,sl=36494,rl=36495,al=36283,ol=36284,ea=36285,ll=36286,Qs=2300,tr=2301,cl=2302,ph=2303,mh=2400,gh=2401,xh=2402,Od=2500,Bd=0,vh=1,hl=2,kd=3200,er=0,Vd=1,ci="",Fe="srgb",xn="srgb-linear",na="linear",he="srgb",ul=7680,Hd=519,Gd=512,Wd=513,Xd=514,fl=515,Yd=516,qd=517,dl=518,Zd=519,_h=35044,Si=35048,Mh="300 es",Zn=2e3,nr=2001;function $d(r){for(let t=r.length-1;t>=0;--t)if(r[t]>=65535)return!0;return!1}function Kd(r){return ArrayBuffer.isView(r)&&!(r instanceof DataView)}function ir(r){return document.createElementNS("http://www.w3.org/1999/xhtml",r)}function Jd(){const r=ir("canvas");return r.style.display="block",r}const yh={};function ia(...r){const t="THREE."+r.shift();console.log(t,...r)}function Sh(r){const t=r[0];if(typeof t=="string"&&t.startsWith("TSL:")){const e=r[1];e&&e.isStackTrace?r[0]+=" "+e.getLocation():r[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return r}function Nt(...r){r=Sh(r);const t="THREE."+r.shift();{const e=r[0];e&&e.isStackTrace?console.warn(e.getError(t)):console.warn(t,...r)}}function Ot(...r){r=Sh(r);const t="THREE."+r.shift();{const e=r[0];e&&e.isStackTrace?console.error(e.getError(t)):console.error(t,...r)}}function es(...r){const t=r.join(" ");t in yh||(yh[t]=!0,Nt(...r))}function jd(r,t,e){return new Promise(function(n,i){function s(){switch(r.clientWaitSync(t,r.SYNC_FLUSH_COMMANDS_BIT,0)){case r.WAIT_FAILED:i();break;case r.TIMEOUT_EXPIRED:setTimeout(s,e);break;default:n()}}setTimeout(s,e)})}const Qd={[uo]:fo,[po]:xo,[mo]:vo,[Ks]:go,[fo]:uo,[xo]:po,[vo]:mo,[go]:Ks};class bi{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){const n=this._listeners;return n===void 0?!1:n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){const n=this._listeners;if(n===void 0)return;const i=n[t];if(i!==void 0){const s=i.indexOf(e);s!==-1&&i.splice(s,1)}}dispatchEvent(t){const e=this._listeners;if(e===void 0)return;const n=e[t.type];if(n!==void 0){t.target=this;const i=n.slice(0);for(let s=0,a=i.length;s<a;s++)i[s].call(this,t);t.target=null}}}const Qe=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];let bh=1234567;const sr=Math.PI/180,ns=180/Math.PI;function An(){const r=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Qe[r&255]+Qe[r>>8&255]+Qe[r>>16&255]+Qe[r>>24&255]+"-"+Qe[t&255]+Qe[t>>8&255]+"-"+Qe[t>>16&15|64]+Qe[t>>24&255]+"-"+Qe[e&63|128]+Qe[e>>8&255]+"-"+Qe[e>>16&255]+Qe[e>>24&255]+Qe[n&255]+Qe[n>>8&255]+Qe[n>>16&255]+Qe[n>>24&255]).toLowerCase()}function qt(r,t,e){return Math.max(t,Math.min(e,r))}function pl(r,t){return(r%t+t)%t}function tp(r,t,e,n,i){return n+(r-t)*(i-n)/(e-t)}function ep(r,t,e){return r!==t?(e-r)/(t-r):0}function rr(r,t,e){return(1-e)*r+e*t}function np(r,t,e,n){return rr(r,t,1-Math.exp(-e*n))}function ip(r,t=1){return t-Math.abs(pl(r,t*2)-t)}function sp(r,t,e){return r<=t?0:r>=e?1:(r=(r-t)/(e-t),r*r*(3-2*r))}function rp(r,t,e){return r<=t?0:r>=e?1:(r=(r-t)/(e-t),r*r*r*(r*(r*6-15)+10))}function ap(r,t){return r+Math.floor(Math.random()*(t-r+1))}function op(r,t){return r+Math.random()*(t-r)}function lp(r){return r*(.5-Math.random())}function cp(r){r!==void 0&&(bh=r);let t=bh+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function hp(r){return r*sr}function up(r){return r*ns}function fp(r){return r>0&&Number.isInteger(r)&&2**Math.round(Math.log2(r))===r}function dp(r){return Math.pow(2,Math.ceil(Math.log(r)/Math.LN2))}function pp(r){return Math.pow(2,Math.floor(Math.log(r)/Math.LN2))}function mp(r,t,e,n,i){const s=Math.cos,a=Math.sin,o=s(e/2),l=a(e/2),c=s((t+n)/2),h=a((t+n)/2),d=s((t-n)/2),u=a((t-n)/2),f=s((n-t)/2),m=a((n-t)/2);switch(i){case"XYX":r.set(o*h,l*d,l*u,o*c);break;case"YZY":r.set(l*u,o*h,l*d,o*c);break;case"ZXZ":r.set(l*d,l*u,o*h,o*c);break;case"XZX":r.set(o*h,l*m,l*f,o*c);break;case"YXY":r.set(l*f,o*h,l*m,o*c);break;case"ZYZ":r.set(l*m,l*f,o*h,o*c);break;default:Nt("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+i)}}function zn(r,t){switch(t.constructor){case Float32Array:return r;case Uint32Array:return r/4294967295;case Uint16Array:return r/65535;case Uint8Array:case Uint8ClampedArray:return r/255;case Int32Array:return Math.max(r/2147483647,-1);case Int16Array:return Math.max(r/32767,-1);case Int8Array:return Math.max(r/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function me(r,t){switch(t.constructor){case Float32Array:return r;case Uint32Array:return Math.round(r*4294967295);case Uint16Array:return Math.round(r*65535);case Uint8Array:case Uint8ClampedArray:return Math.round(r*255);case Int32Array:return Math.round(r*2147483647);case Int16Array:return Math.round(r*32767);case Int8Array:return Math.round(r*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}const sa={DEG2RAD:sr,RAD2DEG:ns,generateUUID:An,clamp:qt,euclideanModulo:pl,mapLinear:tp,inverseLerp:ep,lerp:rr,damp:np,pingpong:ip,smoothstep:sp,smootherstep:rp,randInt:ap,randFloat:op,randFloatSpread:lp,seededRandom:cp,degToRad:hp,radToDeg:up,isPowerOfTwo:fp,ceilPowerOfTwo:dp,floorPowerOfTwo:pp,setQuaternionFromProperEuler:mp,normalize:me,denormalize:zn},qc=class qc{constructor(t=0,e=0){this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("THREE.Vector2: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){const e=this.x,n=this.y,i=t.elements;return this.x=i[0]*e+i[3]*n+i[6],this.y=i[1]*e+i[4]*n+i[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=qt(this.x,t.x,e.x),this.y=qt(this.y,t.y,e.y),this}clampScalar(t,e){return this.x=qt(this.x,t,e),this.y=qt(this.y,t,e),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(qt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){const e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;const n=this.dot(t)/e;return Math.acos(qt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){const e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){const n=Math.cos(e),i=Math.sin(e),s=this.x-t.x,a=this.y-t.y;return this.x=s*n-a*i+t.x,this.y=s*i+a*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}};qc.prototype.isVector2=!0;let ft=qc;class He{constructor(t=0,e=0,n=0,i=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=i}static slerpFlat(t,e,n,i,s,a,o){let l=n[i+0],c=n[i+1],h=n[i+2],d=n[i+3],u=s[a+0],f=s[a+1],m=s[a+2],_=s[a+3];if(d!==_||l!==u||c!==f||h!==m){let p=l*u+c*f+h*m+d*_;p<0&&(u=-u,f=-f,m=-m,_=-_,p=-p);let g=1-o;if(p<.9995){const v=Math.acos(p),M=Math.sin(v);g=Math.sin(g*v)/M,o=Math.sin(o*v)/M,l=l*g+u*o,c=c*g+f*o,h=h*g+m*o,d=d*g+_*o}else{l=l*g+u*o,c=c*g+f*o,h=h*g+m*o,d=d*g+_*o;const v=1/Math.sqrt(l*l+c*c+h*h+d*d);l*=v,c*=v,h*=v,d*=v}}t[e]=l,t[e+1]=c,t[e+2]=h,t[e+3]=d}static multiplyQuaternionsFlat(t,e,n,i,s,a){const o=n[i],l=n[i+1],c=n[i+2],h=n[i+3],d=s[a],u=s[a+1],f=s[a+2],m=s[a+3];return t[e]=o*m+h*d+l*f-c*u,t[e+1]=l*m+h*u+c*d-o*f,t[e+2]=c*m+h*f+o*u-l*d,t[e+3]=h*m-o*d-l*u-c*f,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,i){return this._x=t,this._y=e,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){const n=t._x,i=t._y,s=t._z,a=t._order,o=Math.cos,l=Math.sin,c=o(n/2),h=o(i/2),d=o(s/2),u=l(n/2),f=l(i/2),m=l(s/2);switch(a){case"XYZ":this._x=u*h*d+c*f*m,this._y=c*f*d-u*h*m,this._z=c*h*m+u*f*d,this._w=c*h*d-u*f*m;break;case"YXZ":this._x=u*h*d+c*f*m,this._y=c*f*d-u*h*m,this._z=c*h*m-u*f*d,this._w=c*h*d+u*f*m;break;case"ZXY":this._x=u*h*d-c*f*m,this._y=c*f*d+u*h*m,this._z=c*h*m+u*f*d,this._w=c*h*d-u*f*m;break;case"ZYX":this._x=u*h*d-c*f*m,this._y=c*f*d+u*h*m,this._z=c*h*m-u*f*d,this._w=c*h*d+u*f*m;break;case"YZX":this._x=u*h*d+c*f*m,this._y=c*f*d+u*h*m,this._z=c*h*m-u*f*d,this._w=c*h*d-u*f*m;break;case"XZY":this._x=u*h*d-c*f*m,this._y=c*f*d-u*h*m,this._z=c*h*m+u*f*d,this._w=c*h*d+u*f*m;break;default:Nt("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){const n=e/2,i=Math.sin(n);return this._x=t.x*i,this._y=t.y*i,this._z=t.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){const e=t.elements,n=e[0],i=e[4],s=e[8],a=e[1],o=e[5],l=e[9],c=e[2],h=e[6],d=e[10],u=n+o+d;if(u>0){const f=.5/Math.sqrt(u+1);this._w=.25/f,this._x=(h-l)*f,this._y=(s-c)*f,this._z=(a-i)*f}else if(n>o&&n>d){const f=2*Math.sqrt(1+n-o-d);this._w=(h-l)/f,this._x=.25*f,this._y=(i+a)/f,this._z=(s+c)/f}else if(o>d){const f=2*Math.sqrt(1+o-n-d);this._w=(s-c)/f,this._x=(i+a)/f,this._y=.25*f,this._z=(l+h)/f}else{const f=2*Math.sqrt(1+d-n-o);this._w=(a-i)/f,this._x=(s+c)/f,this._y=(l+h)/f,this._z=.25*f}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<1e-8?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(qt(this.dot(t),-1,1)))}rotateTowards(t,e){const n=this.angleTo(t);if(n===0)return this;const i=Math.min(1,e/n);return this.slerp(t,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){const n=t._x,i=t._y,s=t._z,a=t._w,o=e._x,l=e._y,c=e._z,h=e._w;return this._x=n*h+a*o+i*c-s*l,this._y=i*h+a*l+s*o-n*c,this._z=s*h+a*c+n*l-i*o,this._w=a*h-n*o-i*l-s*c,this._onChangeCallback(),this}slerp(t,e){let n=t._x,i=t._y,s=t._z,a=t._w,o=this.dot(t);o<0&&(n=-n,i=-i,s=-s,a=-a,o=-o);let l=1-e;if(o<.9995){const c=Math.acos(o),h=Math.sin(c);l=Math.sin(l*c)/h,e=Math.sin(e*c)/h,this._x=this._x*l+n*e,this._y=this._y*l+i*e,this._z=this._z*l+s*e,this._w=this._w*l+a*e,this._onChangeCallback()}else this._x=this._x*l+n*e,this._y=this._y*l+i*e,this._z=this._z*l+s*e,this._w=this._w*l+a*e,this.normalize();return this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){const t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),s=Math.sqrt(n);return this.set(i*Math.sin(t),i*Math.cos(t),s*Math.sin(e),s*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}const Zc=class Zc{constructor(t=0,e=0,n=0){this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("THREE.Vector3: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(wh.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(wh.setFromAxisAngle(t,e))}applyMatrix3(t){const e=this.x,n=this.y,i=this.z,s=t.elements;return this.x=s[0]*e+s[3]*n+s[6]*i,this.y=s[1]*e+s[4]*n+s[7]*i,this.z=s[2]*e+s[5]*n+s[8]*i,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){const e=this.x,n=this.y,i=this.z,s=t.elements,a=1/(s[3]*e+s[7]*n+s[11]*i+s[15]);return this.x=(s[0]*e+s[4]*n+s[8]*i+s[12])*a,this.y=(s[1]*e+s[5]*n+s[9]*i+s[13])*a,this.z=(s[2]*e+s[6]*n+s[10]*i+s[14])*a,this}applyQuaternion(t){const e=this.x,n=this.y,i=this.z,s=t.x,a=t.y,o=t.z,l=t.w,c=2*(a*i-o*n),h=2*(o*e-s*i),d=2*(s*n-a*e);return this.x=e+l*c+a*d-o*h,this.y=n+l*h+o*c-s*d,this.z=i+l*d+s*h-a*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){const e=this.x,n=this.y,i=this.z,s=t.elements;return this.x=s[0]*e+s[4]*n+s[8]*i,this.y=s[1]*e+s[5]*n+s[9]*i,this.z=s[2]*e+s[6]*n+s[10]*i,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=qt(this.x,t.x,e.x),this.y=qt(this.y,t.y,e.y),this.z=qt(this.z,t.z,e.z),this}clampScalar(t,e){return this.x=qt(this.x,t,e),this.y=qt(this.y,t,e),this.z=qt(this.z,t,e),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(qt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){const n=t.x,i=t.y,s=t.z,a=e.x,o=e.y,l=e.z;return this.x=i*l-s*o,this.y=s*a-n*l,this.z=n*o-i*a,this}projectOnVector(t){const e=t.lengthSq();if(e===0)return this.set(0,0,0);const n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return ml.copy(this).projectOnVector(t),this.sub(ml)}reflect(t){return this.sub(ml.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){const e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;const n=this.dot(t)/e;return Math.acos(qt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){const e=this.x-t.x,n=this.y-t.y,i=this.z-t.z;return e*e+n*n+i*i}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){const i=Math.sin(e)*t;return this.x=i*Math.sin(n),this.y=Math.cos(e)*t,this.z=i*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){const e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){const e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),i=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=i,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}};Zc.prototype.isVector3=!0;let L=Zc;const ml=new L,wh=new He,$c=class $c{constructor(t,e,n,i,s,a,o,l,c){this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,i,s,a,o,l,c)}set(t,e,n,i,s,a,o,l,c){const h=this.elements;return h[0]=t,h[1]=i,h[2]=o,h[3]=e,h[4]=s,h[5]=l,h[6]=n,h[7]=a,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){const e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){const e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){const n=t.elements,i=e.elements,s=this.elements,a=n[0],o=n[3],l=n[6],c=n[1],h=n[4],d=n[7],u=n[2],f=n[5],m=n[8],_=i[0],p=i[3],g=i[6],v=i[1],M=i[4],x=i[7],b=i[2],S=i[5],T=i[8];return s[0]=a*_+o*v+l*b,s[3]=a*p+o*M+l*S,s[6]=a*g+o*x+l*T,s[1]=c*_+h*v+d*b,s[4]=c*p+h*M+d*S,s[7]=c*g+h*x+d*T,s[2]=u*_+f*v+m*b,s[5]=u*p+f*M+m*S,s[8]=u*g+f*x+m*T,this}multiplyScalar(t){const e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){const t=this.elements,e=t[0],n=t[1],i=t[2],s=t[3],a=t[4],o=t[5],l=t[6],c=t[7],h=t[8];return e*a*h-e*o*c-n*s*h+n*o*l+i*s*c-i*a*l}invert(){const t=this.elements,e=t[0],n=t[1],i=t[2],s=t[3],a=t[4],o=t[5],l=t[6],c=t[7],h=t[8],d=h*a-o*c,u=o*l-h*s,f=c*s-a*l,m=e*d+n*u+i*f;if(m===0)return this.set(0,0,0,0,0,0,0,0,0);const _=1/m;return t[0]=d*_,t[1]=(i*c-h*n)*_,t[2]=(o*n-i*a)*_,t[3]=u*_,t[4]=(h*e-i*l)*_,t[5]=(i*s-o*e)*_,t[6]=f*_,t[7]=(n*l-c*e)*_,t[8]=(a*e-n*s)*_,this}transpose(){let t;const e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){const e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,i,s,a,o){const l=Math.cos(s),c=Math.sin(s);return this.set(n*l,n*c,-n*(l*a+c*o)+a+t,-i*c,i*l,-i*(-c*a+l*o)+o+e,0,0,1),this}scale(t,e){return es("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(gl.makeScale(t,e)),this}rotate(t){return es("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(gl.makeRotation(-t)),this}translate(t,e){return es("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(gl.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){const e=this.elements,n=t.elements;for(let i=0;i<9;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){const n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}};$c.prototype.isMatrix3=!0;let Wt=$c;const gl=new Wt,Ah=new Wt().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Th=new Wt().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function gp(){const r={enabled:!0,workingColorSpace:xn,spaces:{},convert:function(i,s,a){return this.enabled===!1||s===a||!s||!a||(this.spaces[s].transfer===he&&(i.r=hi(i.r),i.g=hi(i.g),i.b=hi(i.b)),this.spaces[s].primaries!==this.spaces[a].primaries&&(i.applyMatrix3(this.spaces[s].toXYZ),i.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===he&&(i.r=is(i.r),i.g=is(i.g),i.b=is(i.b))),i},workingToColorSpace:function(i,s){return this.convert(i,this.workingColorSpace,s)},colorSpaceToWorking:function(i,s){return this.convert(i,s,this.workingColorSpace)},getPrimaries:function(i){return this.spaces[i].primaries},getTransfer:function(i){return i===ci?na:this.spaces[i].transfer},getToneMappingMode:function(i){return this.spaces[i].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(i,s=this.workingColorSpace){return i.fromArray(this.spaces[s].luminanceCoefficients)},define:function(i){Object.assign(this.spaces,i)},_getMatrix:function(i,s,a){return i.copy(this.spaces[s].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(i){return this.spaces[i].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(i=this.workingColorSpace){return this.spaces[i].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(i,s){return es("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),r.workingToColorSpace(i,s)},toWorkingColorSpace:function(i,s){return es("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),r.colorSpaceToWorking(i,s)}},t=[.64,.33,.3,.6,.15,.06],e=[.2126,.7152,.0722],n=[.3127,.329];return r.define({[xn]:{primaries:t,whitePoint:n,transfer:na,toXYZ:Ah,fromXYZ:Th,luminanceCoefficients:e,workingColorSpaceConfig:{unpackColorSpace:Fe},outputColorSpaceConfig:{drawingBufferColorSpace:Fe}},[Fe]:{primaries:t,whitePoint:n,transfer:he,toXYZ:Ah,fromXYZ:Th,luminanceCoefficients:e,outputColorSpaceConfig:{drawingBufferColorSpace:Fe}}}),r}const Qt=gp();function hi(r){return r<.04045?r*.0773993808:Math.pow(r*.9478672986+.0521327014,2.4)}function is(r){return r<.0031308?r*12.92:1.055*Math.pow(r,.41666)-.055}let ss;class xp{static getDataURL(t,e="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{ss===void 0&&(ss=ir("canvas")),ss.width=t.width,ss.height=t.height;const i=ss.getContext("2d");t instanceof ImageData?i.putImageData(t,0,0):i.drawImage(t,0,0,t.width,t.height),n=ss}return n.toDataURL(e)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){const e=ir("canvas");e.width=t.width,e.height=t.height;const n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);const i=n.getImageData(0,0,t.width,t.height),s=i.data;for(let a=0;a<s.length;a++)s[a]=hi(s[a]/255)*255;return n.putImageData(i,0,0),e}else if(t.data){const e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(hi(e[n]/255)*255):e[n]=hi(e[n]);return{data:e,width:t.width,height:t.height}}else return Nt("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}}let vp=0;class xl{constructor(t=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:vp++}),this.uuid=An(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){const e=this.data;return typeof HTMLVideoElement<"u"&&e instanceof HTMLVideoElement?t.set(e.videoWidth,e.videoHeight,0):typeof VideoFrame<"u"&&e instanceof VideoFrame?t.set(e.displayWidth,e.displayHeight,0):e!==null?t.set(e.width,e.height,e.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){const e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];const n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let s;if(Array.isArray(i)){s=[];for(let a=0,o=i.length;a<o;a++)i[a].isDataTexture?s.push(vl(i[a].image)):s.push(vl(i[a]))}else s=vl(i);n.url=s}return e||(t.images[this.uuid]=n),n}}function vl(r){return typeof HTMLImageElement<"u"&&r instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&r instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&r instanceof ImageBitmap?xp.getDataURL(r):r.data?{data:Array.from(r.data),width:r.width,height:r.height,type:r.data.constructor.name}:(Nt("Texture: Unable to serialize Texture."),{})}let _p=0;const _l=new L;class Re extends bi{constructor(t=Re.DEFAULT_IMAGE,e=Re.DEFAULT_MAPPING,n=bn,i=bn,s=Ne,a=oi,o=gn,l=sn,c=Re.DEFAULT_ANISOTROPY,h=ci){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:_p++}),this.uuid=An(),this.name="",this.source=new xl(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=s,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new ft(0,0),this.repeat=new ft(1,1),this.center=new ft(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Wt,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(_l).x}get height(){return this.source.getSize(_l).y}get depth(){return this.source.getSize(_l).z}get image(){return this.source.data}set image(t){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.normalized=t.normalized,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(const e in t){const n=t[e];if(n===void 0){Nt(`Texture.setValues(): parameter '${e}' has value of undefined.`);continue}const i=this[e];if(i===void 0){Nt(`Texture.setValues(): property '${e}' does not exist.`);continue}i&&n&&i.isVector2&&n.isVector2||i&&n&&i.isVector3&&n.isVector3||i&&n&&i.isMatrix3&&n.isMatrix3?i.copy(n):this[e]=n}}toJSON(t){const e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];const n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==ah)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case hn:t.x=t.x-Math.floor(t.x);break;case bn:t.x=t.x<0?0:1;break;case qr:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case hn:t.y=t.y-Math.floor(t.y);break;case bn:t.y=t.y<0?0:1;break;case qr:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}}Re.DEFAULT_IMAGE=null,Re.DEFAULT_MAPPING=ah,Re.DEFAULT_ANISOTROPY=1;const Kc=class Kc{constructor(t=0,e=0,n=0,i=1){this.x=t,this.y=e,this.z=n,this.w=i}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,i){return this.x=t,this.y=e,this.z=n,this.w=i,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("THREE.Vector4: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){const e=this.x,n=this.y,i=this.z,s=this.w,a=t.elements;return this.x=a[0]*e+a[4]*n+a[8]*i+a[12]*s,this.y=a[1]*e+a[5]*n+a[9]*i+a[13]*s,this.z=a[2]*e+a[6]*n+a[10]*i+a[14]*s,this.w=a[3]*e+a[7]*n+a[11]*i+a[15]*s,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);const e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,i,s;const l=t.elements,c=l[0],h=l[4],d=l[8],u=l[1],f=l[5],m=l[9],_=l[2],p=l[6],g=l[10];if(Math.abs(h-u)<.01&&Math.abs(d-_)<.01&&Math.abs(m-p)<.01){if(Math.abs(h+u)<.1&&Math.abs(d+_)<.1&&Math.abs(m+p)<.1&&Math.abs(c+f+g-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;const M=(c+1)/2,x=(f+1)/2,b=(g+1)/2,S=(h+u)/4,T=(d+_)/4,y=(m+p)/4;return M>x&&M>b?M<.01?(n=0,i=.707106781,s=.707106781):(n=Math.sqrt(M),i=S/n,s=T/n):x>b?x<.01?(n=.707106781,i=0,s=.707106781):(i=Math.sqrt(x),n=S/i,s=y/i):b<.01?(n=.707106781,i=.707106781,s=0):(s=Math.sqrt(b),n=T/s,i=y/s),this.set(n,i,s,e),this}let v=Math.sqrt((p-m)*(p-m)+(d-_)*(d-_)+(u-h)*(u-h));return Math.abs(v)<.001&&(v=1),this.x=(p-m)/v,this.y=(d-_)/v,this.z=(u-h)/v,this.w=Math.acos((c+f+g-1)/2),this}setFromMatrixPosition(t){const e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=qt(this.x,t.x,e.x),this.y=qt(this.y,t.y,e.y),this.z=qt(this.z,t.z,e.z),this.w=qt(this.w,t.w,e.w),this}clampScalar(t,e){return this.x=qt(this.x,t,e),this.y=qt(this.y,t,e),this.z=qt(this.z,t,e),this.w=qt(this.w,t,e),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(qt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}};Kc.prototype.isVector4=!0;let ue=Kc;class Mp extends bi{constructor(t=1,e=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Ne,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=n.depth,this.scissor=new ue(0,0,t,e),this.scissorTest=!1,this.viewport=new ue(0,0,t,e),this.textures=[];const i={width:t,height:e,depth:n.depth},s=new Re(i),a=n.count;for(let o=0;o<a;o++)this.textures[o]=s.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveColorBuffer=n.resolveColorBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.storeMultisampledColorBuffer=n.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=n.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=n.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(t={}){const e={minFilter:Ne,generateMipmaps:!1,flipY:!1,internalFormat:null};t.mapping!==void 0&&(e.mapping=t.mapping),t.wrapS!==void 0&&(e.wrapS=t.wrapS),t.wrapT!==void 0&&(e.wrapT=t.wrapT),t.wrapR!==void 0&&(e.wrapR=t.wrapR),t.magFilter!==void 0&&(e.magFilter=t.magFilter),t.minFilter!==void 0&&(e.minFilter=t.minFilter),t.format!==void 0&&(e.format=t.format),t.type!==void 0&&(e.type=t.type),t.anisotropy!==void 0&&(e.anisotropy=t.anisotropy),t.colorSpace!==void 0&&(e.colorSpace=t.colorSpace),t.flipY!==void 0&&(e.flipY=t.flipY),t.generateMipmaps!==void 0&&(e.generateMipmaps=t.generateMipmaps),t.internalFormat!==void 0&&(e.internalFormat=t.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(e)}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}set depthTexture(t){this._depthTexture!==null&&this._depthTexture.renderTarget===this&&(this._depthTexture.renderTarget=null),t!==null&&t.renderTarget===null&&(t.renderTarget=this),this._depthTexture=t}get depthTexture(){return this._depthTexture}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let i=0,s=this.textures.length;i<s;i++)this.textures[i].image.width=t,this.textures[i].image.height=e,this.textures[i].image.depth=n,this.textures[i].isData3DTexture!==!0&&(this.textures[i].isArrayTexture=this.textures[i].image.depth>1);this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let e=0,n=t.textures.length;e<n;e++){this.textures[e]=t.textures[e].clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;const i=Object.assign({},t.textures[e].image);this.textures[e].source=new xl(i)}if(this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveColorBuffer=t.resolveColorBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,this.storeMultisampledColorBuffer=t.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=t.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=t.storeMultisampledStencilBuffer,t.depthTexture!==null)if(t.depthTexture.renderTarget===t){const e=t.depthTexture.clone();e.renderTarget=null,this.depthTexture=e}else this.depthTexture=t.depthTexture;return this.samples=t.samples,this.multiview=t.multiview,this.useArrayDepthTexture=t.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}}class $e extends Mp{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}}class Eh extends Re{constructor(t=null,e=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=Ue,this.minFilter=Ue,this.wrapR=bn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(t){return super.copy(t),this.wrapR=t.wrapR,this}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}}class yp extends Re{constructor(t=null,e=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=Ue,this.minFilter=Ue,this.wrapR=bn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(t){return super.copy(t),this.wrapR=t.wrapR,this}}const oo=class oo{constructor(t,e,n,i,s,a,o,l,c,h,d,u,f,m,_,p){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,i,s,a,o,l,c,h,d,u,f,m,_,p)}set(t,e,n,i,s,a,o,l,c,h,d,u,f,m,_,p){const g=this.elements;return g[0]=t,g[4]=e,g[8]=n,g[12]=i,g[1]=s,g[5]=a,g[9]=o,g[13]=l,g[2]=c,g[6]=h,g[10]=d,g[14]=u,g[3]=f,g[7]=m,g[11]=_,g[15]=p,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new oo().fromArray(this.elements)}copy(t){const e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){const e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){const e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return this.determinantAffine()===0?(t.set(1,0,0),e.set(0,1,0),n.set(0,0,1),this):(t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){if(t.determinantAffine()===0)return this.identity();const e=this.elements,n=t.elements,i=1/rs.setFromMatrixColumn(t,0).length(),s=1/rs.setFromMatrixColumn(t,1).length(),a=1/rs.setFromMatrixColumn(t,2).length();return e[0]=n[0]*i,e[1]=n[1]*i,e[2]=n[2]*i,e[3]=0,e[4]=n[4]*s,e[5]=n[5]*s,e[6]=n[6]*s,e[7]=0,e[8]=n[8]*a,e[9]=n[9]*a,e[10]=n[10]*a,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){const e=this.elements,n=t.x,i=t.y,s=t.z,a=Math.cos(n),o=Math.sin(n),l=Math.cos(i),c=Math.sin(i),h=Math.cos(s),d=Math.sin(s);if(t.order==="XYZ"){const u=a*h,f=a*d,m=o*h,_=o*d;e[0]=l*h,e[4]=-l*d,e[8]=c,e[1]=f+m*c,e[5]=u-_*c,e[9]=-o*l,e[2]=_-u*c,e[6]=m+f*c,e[10]=a*l}else if(t.order==="YXZ"){const u=l*h,f=l*d,m=c*h,_=c*d;e[0]=u+_*o,e[4]=m*o-f,e[8]=a*c,e[1]=a*d,e[5]=a*h,e[9]=-o,e[2]=f*o-m,e[6]=_+u*o,e[10]=a*l}else if(t.order==="ZXY"){const u=l*h,f=l*d,m=c*h,_=c*d;e[0]=u-_*o,e[4]=-a*d,e[8]=m+f*o,e[1]=f+m*o,e[5]=a*h,e[9]=_-u*o,e[2]=-a*c,e[6]=o,e[10]=a*l}else if(t.order==="ZYX"){const u=a*h,f=a*d,m=o*h,_=o*d;e[0]=l*h,e[4]=m*c-f,e[8]=u*c+_,e[1]=l*d,e[5]=_*c+u,e[9]=f*c-m,e[2]=-c,e[6]=o*l,e[10]=a*l}else if(t.order==="YZX"){const u=a*l,f=a*c,m=o*l,_=o*c;e[0]=l*h,e[4]=_-u*d,e[8]=m*d+f,e[1]=d,e[5]=a*h,e[9]=-o*h,e[2]=-c*h,e[6]=f*d+m,e[10]=u-_*d}else if(t.order==="XZY"){const u=a*l,f=a*c,m=o*l,_=o*c;e[0]=l*h,e[4]=-d,e[8]=c*h,e[1]=u*d+_,e[5]=a*h,e[9]=f*d-m,e[2]=m*d-f,e[6]=o*h,e[10]=_*d+u}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(Sp,t,bp)}lookAt(t,e,n){const i=this.elements;return vn.subVectors(t,e),vn.lengthSq()===0&&(vn.z=1),vn.normalize(),wi.crossVectors(n,vn),wi.lengthSq()===0&&(Math.abs(n.z)===1?vn.x+=1e-4:vn.z+=1e-4,vn.normalize(),wi.crossVectors(n,vn)),wi.normalize(),ra.crossVectors(vn,wi),i[0]=wi.x,i[4]=ra.x,i[8]=vn.x,i[1]=wi.y,i[5]=ra.y,i[9]=vn.y,i[2]=wi.z,i[6]=ra.z,i[10]=vn.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){const n=t.elements,i=e.elements,s=this.elements,a=n[0],o=n[4],l=n[8],c=n[12],h=n[1],d=n[5],u=n[9],f=n[13],m=n[2],_=n[6],p=n[10],g=n[14],v=n[3],M=n[7],x=n[11],b=n[15],S=i[0],T=i[4],y=i[8],A=i[12],E=i[1],P=i[5],D=i[9],N=i[13],R=i[2],B=i[6],V=i[10],Y=i[14],it=i[3],Z=i[7],j=i[11],ct=i[15];return s[0]=a*S+o*E+l*R+c*it,s[4]=a*T+o*P+l*B+c*Z,s[8]=a*y+o*D+l*V+c*j,s[12]=a*A+o*N+l*Y+c*ct,s[1]=h*S+d*E+u*R+f*it,s[5]=h*T+d*P+u*B+f*Z,s[9]=h*y+d*D+u*V+f*j,s[13]=h*A+d*N+u*Y+f*ct,s[2]=m*S+_*E+p*R+g*it,s[6]=m*T+_*P+p*B+g*Z,s[10]=m*y+_*D+p*V+g*j,s[14]=m*A+_*N+p*Y+g*ct,s[3]=v*S+M*E+x*R+b*it,s[7]=v*T+M*P+x*B+b*Z,s[11]=v*y+M*D+x*V+b*j,s[15]=v*A+M*N+x*Y+b*ct,this}multiplyScalar(t){const e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){const t=this.elements,e=t[0],n=t[4],i=t[8],s=t[12],a=t[1],o=t[5],l=t[9],c=t[13],h=t[2],d=t[6],u=t[10],f=t[14],m=t[3],_=t[7],p=t[11],g=t[15],v=l*f-c*u,M=o*f-c*d,x=o*u-l*d,b=a*f-c*h,S=a*u-l*h,T=a*d-o*h;return e*(_*v-p*M+g*x)-n*(m*v-p*b+g*S)+i*(m*M-_*b+g*T)-s*(m*x-_*S+p*T)}determinantAffine(){const t=this.elements,e=t[0],n=t[4],i=t[8],s=t[1],a=t[5],o=t[9],l=t[2],c=t[6],h=t[10];return e*(a*h-o*c)-n*(s*h-o*l)+i*(s*c-a*l)}transpose(){const t=this.elements;let e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){const i=this.elements;return t.isVector3?(i[12]=t.x,i[13]=t.y,i[14]=t.z):(i[12]=t,i[13]=e,i[14]=n),this}invert(){const t=this.elements,e=t[0],n=t[1],i=t[2],s=t[3],a=t[4],o=t[5],l=t[6],c=t[7],h=t[8],d=t[9],u=t[10],f=t[11],m=t[12],_=t[13],p=t[14],g=t[15],v=e*o-n*a,M=e*l-i*a,x=e*c-s*a,b=n*l-i*o,S=n*c-s*o,T=i*c-s*l,y=h*_-d*m,A=h*p-u*m,E=h*g-f*m,P=d*p-u*_,D=d*g-f*_,N=u*g-f*p,R=v*N-M*D+x*P+b*E-S*A+T*y;if(R===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const B=1/R;return t[0]=(o*N-l*D+c*P)*B,t[1]=(i*D-n*N-s*P)*B,t[2]=(_*T-p*S+g*b)*B,t[3]=(u*S-d*T-f*b)*B,t[4]=(l*E-a*N-c*A)*B,t[5]=(e*N-i*E+s*A)*B,t[6]=(p*x-m*T-g*M)*B,t[7]=(h*T-u*x+f*M)*B,t[8]=(a*D-o*E+c*y)*B,t[9]=(n*E-e*D-s*y)*B,t[10]=(m*S-_*x+g*v)*B,t[11]=(d*x-h*S-f*v)*B,t[12]=(o*A-a*P-l*y)*B,t[13]=(e*P-n*A+i*y)*B,t[14]=(_*M-m*b-p*v)*B,t[15]=(h*b-d*M+u*v)*B,this}scale(t){const e=this.elements,n=t.x,i=t.y,s=t.z;return e[0]*=n,e[4]*=i,e[8]*=s,e[1]*=n,e[5]*=i,e[9]*=s,e[2]*=n,e[6]*=i,e[10]*=s,e[3]*=n,e[7]*=i,e[11]*=s,this}getMaxScaleOnAxis(){const t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],i=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,i))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){const e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){const n=Math.cos(e),i=Math.sin(e),s=1-n,a=t.x,o=t.y,l=t.z,c=s*a,h=s*o;return this.set(c*a+n,c*o-i*l,c*l+i*o,0,c*o+i*l,h*o+n,h*l-i*a,0,c*l-i*o,h*l+i*a,s*l*l+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,i,s,a){return this.set(1,n,s,0,t,1,a,0,e,i,1,0,0,0,0,1),this}compose(t,e,n){const i=this.elements,s=e._x,a=e._y,o=e._z,l=e._w,c=s+s,h=a+a,d=o+o,u=s*c,f=s*h,m=s*d,_=a*h,p=a*d,g=o*d,v=l*c,M=l*h,x=l*d,b=n.x,S=n.y,T=n.z;return i[0]=(1-(_+g))*b,i[1]=(f+x)*b,i[2]=(m-M)*b,i[3]=0,i[4]=(f-x)*S,i[5]=(1-(u+g))*S,i[6]=(p+v)*S,i[7]=0,i[8]=(m+M)*T,i[9]=(p-v)*T,i[10]=(1-(u+_))*T,i[11]=0,i[12]=t.x,i[13]=t.y,i[14]=t.z,i[15]=1,this}decompose(t,e,n){const i=this.elements;t.x=i[12],t.y=i[13],t.z=i[14];const s=this.determinantAffine();if(s===0)return n.set(1,1,1),e.identity(),this;let a=rs.set(i[0],i[1],i[2]).length();const o=rs.set(i[4],i[5],i[6]).length(),l=rs.set(i[8],i[9],i[10]).length();s<0&&(a=-a),On.copy(this);const c=1/a,h=1/o,d=1/l;return On.elements[0]*=c,On.elements[1]*=c,On.elements[2]*=c,On.elements[4]*=h,On.elements[5]*=h,On.elements[6]*=h,On.elements[8]*=d,On.elements[9]*=d,On.elements[10]*=d,e.setFromRotationMatrix(On),n.x=a,n.y=o,n.z=l,this}makePerspective(t,e,n,i,s,a,o=Zn,l=!1){const c=this.elements,h=2*s/(e-t),d=2*s/(n-i),u=(e+t)/(e-t),f=(n+i)/(n-i);let m,_;if(l)m=s/(a-s),_=a*s/(a-s);else if(o===Zn)m=-(a+s)/(a-s),_=-2*a*s/(a-s);else if(o===nr)m=-a/(a-s),_=-a*s/(a-s);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=u,c[12]=0,c[1]=0,c[5]=d,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=m,c[14]=_,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(t,e,n,i,s,a,o=Zn,l=!1){const c=this.elements,h=2/(e-t),d=2/(n-i),u=-(e+t)/(e-t),f=-(n+i)/(n-i);let m,_;if(l)m=1/(a-s),_=a/(a-s);else if(o===Zn)m=-2/(a-s),_=-(a+s)/(a-s);else if(o===nr)m=-1/(a-s),_=-s/(a-s);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=0,c[12]=u,c[1]=0,c[5]=d,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=m,c[14]=_,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(t){const e=this.elements,n=t.elements;for(let i=0;i<16;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){const n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}};oo.prototype.isMatrix4=!0;let It=oo;const rs=new L,On=new It,Sp=new L(0,0,0),bp=new L(1,1,1),wi=new L,ra=new L,vn=new L,Ch=new It,Rh=new He;class Tn{constructor(t=0,e=0,n=0,i=Tn.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=i}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,i=this._order){return this._x=t,this._y=e,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){const i=t.elements,s=i[0],a=i[4],o=i[8],l=i[1],c=i[5],h=i[9],d=i[2],u=i[6],f=i[10];switch(e){case"XYZ":this._y=Math.asin(qt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-h,f),this._z=Math.atan2(-a,s)):(this._x=Math.atan2(u,c),this._z=0);break;case"YXZ":this._x=Math.asin(-qt(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-d,s),this._z=0);break;case"ZXY":this._x=Math.asin(qt(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(-d,f),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,s));break;case"ZYX":this._y=Math.asin(-qt(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(u,f),this._z=Math.atan2(l,s)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(qt(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-d,s)):(this._x=0,this._y=Math.atan2(o,f));break;case"XZY":this._z=Math.asin(-qt(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(u,c),this._y=Math.atan2(o,s)):(this._x=Math.atan2(-h,f),this._y=0);break;default:Nt("Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return Ch.makeRotationFromQuaternion(t),this.setFromRotationMatrix(Ch,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return Rh.setFromEuler(this),this.setFromQuaternion(Rh,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}Tn.DEFAULT_ORDER="XYZ";class Ml{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}}let wp=0;const Ph=new L,as=new He,ui=new It,aa=new L,ar=new L,Ap=new L,Tp=new He,Ih=new L(1,0,0),Lh=new L(0,1,0),Dh=new L(0,0,1),Uh={type:"added"},Ep={type:"removed"},os={type:"childadded",child:null},yl={type:"childremoved",child:null};class Ae extends bi{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:wp++}),this.uuid=An(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=Ae.DEFAULT_UP.clone();const t=new L,e=new Tn,n=new He,i=new L(1,1,1);function s(){n.setFromEuler(e,!1)}function a(){e.setFromQuaternion(n,void 0,!1)}e._onChange(s),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new It},normalMatrix:{value:new Wt}}),this.matrix=new It,this.matrixWorld=new It,this.matrixAutoUpdate=Ae.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=Ae.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Ml,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return as.setFromAxisAngle(t,e),this.quaternion.multiply(as),this}rotateOnWorldAxis(t,e){return as.setFromAxisAngle(t,e),this.quaternion.premultiply(as),this}rotateX(t){return this.rotateOnAxis(Ih,t)}rotateY(t){return this.rotateOnAxis(Lh,t)}rotateZ(t){return this.rotateOnAxis(Dh,t)}translateOnAxis(t,e){return Ph.copy(t).applyQuaternion(this.quaternion),this.position.add(Ph.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(Ih,t)}translateY(t){return this.translateOnAxis(Lh,t)}translateZ(t){return this.translateOnAxis(Dh,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(ui.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?aa.copy(t):aa.set(t,e,n);const i=this.parent;this.updateWorldMatrix(!0,!1),ar.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?ui.lookAt(ar,aa,this.up):ui.lookAt(aa,ar,this.up),this.quaternion.setFromRotationMatrix(ui),i&&(ui.extractRotation(i.matrixWorld),as.setFromRotationMatrix(ui),this.quaternion.premultiply(as.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(Ot("Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(Uh),os.child=t,this.dispatchEvent(os),os.child=null):Ot("Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(Ep),yl.child=t,this.dispatchEvent(yl),yl.child=null),this}removeFromParent(){const t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),ui.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),ui.multiply(t.parent.matrixWorld)),t.applyMatrix4(ui),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(Uh),os.child=t,this.dispatchEvent(os),os.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,i=this.children.length;n<i;n++){const a=this.children[n].getObjectByProperty(t,e);if(a!==void 0)return a}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);const i=this.children;for(let s=0,a=i.length;s<a;s++)i[s].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ar,t,Ap),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ar,Tp,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);const e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}intersectsFrustum(){}traverse(t){t(this);const e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);const e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverseVisible(t)}traverseAncestors(t){const e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);const t=this.pivot;if(t!==null){const e=t.x,n=t.y,i=t.z,s=this.matrix.elements;s[12]+=e-s[0]*e-s[4]*n-s[8]*i,s[13]+=n-s[1]*e-s[5]*n-s[9]*i,s[14]+=i-s[2]*e-s[6]*n-s[10]*i}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);const e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e,n=!1){const i=this.parent;if(t===!0&&i!==null&&i.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),e===!0){const s=this.children;for(let a=0,o=s.length;a<o;a++)s[a].updateWorldMatrix(!1,!0,n)}}toJSON(t){const e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const i={};i.uuid=this.uuid,i.type=this.type,i.name=this.name,i.castShadow=this.castShadow,i.receiveShadow=this.receiveShadow,i.visible=this.visible,i.frustumCulled=this.frustumCulled,i.renderOrder=this.renderOrder,i.static=this.static,i.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.pivot!==null&&(i.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(i.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(i.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),i.instanceInfo=this._instanceInfo.map(o=>({...o})),i.availableInstanceIds=this._availableInstanceIds.slice(),i.availableGeometryIds=this._availableGeometryIds.slice(),i.nextIndexStart=this._nextIndexStart,i.nextVertexStart=this._nextVertexStart,i.geometryCount=this._geometryCount,i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.matricesTexture=this._matricesTexture.toJSON(t),i.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(i.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(i.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(i.boundingBox=this.boundingBox.toJSON()));function s(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=s(t.geometries,this.geometry);const o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){const l=o.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){const d=l[c];s(t.shapes,d)}else s(t.shapes,l)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(s(t.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(s(t.materials,this.material[l]));i.material=o}else i.material=s(t.materials,this.material);if(this.children.length>0){i.children=[];for(let o=0;o<this.children.length;o++)i.children.push(this.children[o].toJSON(t).object)}if(this.animations.length>0){i.animations=[];for(let o=0;o<this.animations.length;o++){const l=this.animations[o];i.animations.push(s(t.animations,l))}}if(e){const o=a(t.geometries),l=a(t.materials),c=a(t.textures),h=a(t.images),d=a(t.shapes),u=a(t.skeletons),f=a(t.animations),m=a(t.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),d.length>0&&(n.shapes=d),u.length>0&&(n.skeletons=u),f.length>0&&(n.animations=f),m.length>0&&(n.nodes=m)}return n.object=i,n;function a(o){const l=[];for(const c in o){const h=o[c];delete h.metadata,l.push(h)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.pivot=t.pivot!==null?t.pivot.clone():null,this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.static=t.static,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){const i=t.children[n];this.add(i.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}}Ae.DEFAULT_UP=new L(0,1,0),Ae.DEFAULT_MATRIX_AUTO_UPDATE=!0,Ae.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;class ze extends Ae{constructor(){super(),this.isGroup=!0,this.type="Group"}}const Cp={type:"move"};class Sl{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new ze,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new ze,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new L,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new L),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new ze,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new L,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new L,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){const e=this._hand;if(e)for(const n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let i=null,s=null,a=null;const o=this._targetRay,l=this._grip,c=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(c&&t.hand){a=!0;for(const _ of t.hand.values()){const p=e.getJointPose(_,n),g=this._getHandJoint(c,_);p!==null&&(g.matrix.fromArray(p.transform.matrix),g.matrix.decompose(g.position,g.rotation,g.scale),g.matrixWorldNeedsUpdate=!0,g.jointRadius=p.radius),g.visible=p!==null}const h=c.joints["index-finger-tip"],d=c.joints["thumb-tip"],u=h.position.distanceTo(d.position),f=.02,m=.005;c.inputState.pinching&&u>f+m?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&u<=f-m&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(s=e.getPose(t.gripSpace,n),s!==null&&(l.matrix.fromArray(s.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,s.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(s.linearVelocity)):l.hasLinearVelocity=!1,s.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(s.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:t,target:this})));o!==null&&(i=e.getPose(t.targetRaySpace,n),i===null&&s!==null&&(i=s),i!==null&&(o.matrix.fromArray(i.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,i.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(i.linearVelocity)):o.hasLinearVelocity=!1,i.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(i.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(Cp)))}return o!==null&&(o.visible=i!==null),l!==null&&(l.visible=s!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){const n=new ze;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}}const Nh={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Ai={h:0,s:0,l:0},oa={h:0,s:0,l:0};function bl(r,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?r+(t-r)*6*e:e<1/2?t:e<2/3?r+(t-r)*6*(2/3-e):r}class pt{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){const i=t;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=Fe){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,Qt.colorSpaceToWorking(this,e),this}setRGB(t,e,n,i=Qt.workingColorSpace){return this.r=t,this.g=e,this.b=n,Qt.colorSpaceToWorking(this,i),this}setHSL(t,e,n,i=Qt.workingColorSpace){if(t=pl(t,1),e=qt(e,0,1),n=qt(n,0,1),e===0)this.r=this.g=this.b=n;else{const s=n<=.5?n*(1+e):n+e-n*e,a=2*n-s;this.r=bl(a,s,t+1/3),this.g=bl(a,s,t),this.b=bl(a,s,t-1/3)}return Qt.colorSpaceToWorking(this,i),this}setStyle(t,e=Fe){function n(s){s!==void 0&&parseFloat(s)<1&&Nt("Color: Alpha component of "+t+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(t)){let s;const a=i[1],o=i[2];switch(a){case"rgb":case"rgba":if(s=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(s[4]),this.setRGB(Math.min(255,parseInt(s[1],10))/255,Math.min(255,parseInt(s[2],10))/255,Math.min(255,parseInt(s[3],10))/255,e);if(s=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(s[4]),this.setRGB(Math.min(100,parseInt(s[1],10))/100,Math.min(100,parseInt(s[2],10))/100,Math.min(100,parseInt(s[3],10))/100,e);break;case"hsl":case"hsla":if(s=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(s[4]),this.setHSL(parseFloat(s[1])/360,parseFloat(s[2])/100,parseFloat(s[3])/100,e);break;default:Nt("Color: Unknown color model "+t)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(t)){const s=i[1],a=s.length;if(a===3)return this.setRGB(parseInt(s.charAt(0),16)/15,parseInt(s.charAt(1),16)/15,parseInt(s.charAt(2),16)/15,e);if(a===6)return this.setHex(parseInt(s,16),e);Nt("Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=Fe){const n=Nh[t.toLowerCase()];return n!==void 0?this.setHex(n,e):Nt("Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=hi(t.r),this.g=hi(t.g),this.b=hi(t.b),this}copyLinearToSRGB(t){return this.r=is(t.r),this.g=is(t.g),this.b=is(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=Fe){return Qt.workingToColorSpace(tn.copy(this),t),Math.round(qt(tn.r*255,0,255))*65536+Math.round(qt(tn.g*255,0,255))*256+Math.round(qt(tn.b*255,0,255))}getHexString(t=Fe){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=Qt.workingColorSpace){Qt.workingToColorSpace(tn.copy(this),e);const n=tn.r,i=tn.g,s=tn.b,a=Math.max(n,i,s),o=Math.min(n,i,s);let l,c;const h=(o+a)/2;if(o===a)l=0,c=0;else{const d=a-o;switch(c=h<=.5?d/(a+o):d/(2-a-o),a){case n:l=(i-s)/d+(i<s?6:0);break;case i:l=(s-n)/d+2;break;case s:l=(n-i)/d+4;break}l/=6}return t.h=l,t.s=c,t.l=h,t}getRGB(t,e=Qt.workingColorSpace){return Qt.workingToColorSpace(tn.copy(this),e),t.r=tn.r,t.g=tn.g,t.b=tn.b,t}getStyle(t=Fe){Qt.workingToColorSpace(tn.copy(this),t);const e=tn.r,n=tn.g,i=tn.b;return t!==Fe?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(t,e,n){return this.getHSL(Ai),this.setHSL(Ai.h+t,Ai.s+e,Ai.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(Ai),t.getHSL(oa);const n=rr(Ai.h,oa.h,e),i=rr(Ai.s,oa.s,e),s=rr(Ai.l,oa.l,e);return this.setHSL(n,i,s),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){const e=this.r,n=this.g,i=this.b,s=t.elements;return this.r=s[0]*e+s[3]*n+s[6]*i,this.g=s[1]*e+s[4]*n+s[7]*i,this.b=s[2]*e+s[5]*n+s[8]*i,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const tn=new pt;pt.NAMES=Nh;class or{constructor(t,e=1,n=1e3){this.isFog=!0,this.name="",this.color=new pt(t),this.near=e,this.far=n}clone(){return new or(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}}class Rp extends Ae{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Tn,this.environmentIntensity=1,this.environmentRotation=new Tn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){const e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),e.object.backgroundBlurriness=this.backgroundBlurriness,e.object.backgroundIntensity=this.backgroundIntensity,e.object.backgroundRotation=this.backgroundRotation.toArray(),e.object.environmentIntensity=this.environmentIntensity,e.object.environmentRotation=this.environmentRotation.toArray(),e}}const Bn=new L,fi=new L,wl=new L,di=new L,ls=new L,cs=new L,Fh=new L,Al=new L,Tl=new L,El=new L,Cl=new ue,Rl=new ue,Pl=new ue;class En{constructor(t=new L,e=new L,n=new L){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,i){i.subVectors(n,e),Bn.subVectors(t,e),i.cross(Bn);const s=i.lengthSq();return s>0?i.multiplyScalar(1/Math.sqrt(s)):i.set(0,0,0)}static getBarycoord(t,e,n,i,s){Bn.subVectors(i,e),fi.subVectors(n,e),wl.subVectors(t,e);const a=Bn.dot(Bn),o=Bn.dot(fi),l=Bn.dot(wl),c=fi.dot(fi),h=fi.dot(wl),d=a*c-o*o;if(d===0)return s.set(0,0,0),null;const u=1/d,f=(c*l-o*h)*u,m=(a*h-o*l)*u;return s.set(1-f-m,m,f)}static containsPoint(t,e,n,i){return this.getBarycoord(t,e,n,i,di)===null?!1:di.x>=0&&di.y>=0&&di.x+di.y<=1}static getInterpolation(t,e,n,i,s,a,o,l){return this.getBarycoord(t,e,n,i,di)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(s,di.x),l.addScaledVector(a,di.y),l.addScaledVector(o,di.z),l)}static getInterpolatedAttribute(t,e,n,i,s,a){return Cl.setScalar(0),Rl.setScalar(0),Pl.setScalar(0),Cl.fromBufferAttribute(t,e),Rl.fromBufferAttribute(t,n),Pl.fromBufferAttribute(t,i),a.setScalar(0),a.addScaledVector(Cl,s.x),a.addScaledVector(Rl,s.y),a.addScaledVector(Pl,s.z),a}static isFrontFacing(t,e,n,i){return Bn.subVectors(n,e),fi.subVectors(t,e),Bn.cross(fi).dot(i)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,i){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[i]),this}setFromAttributeAndIndices(t,e,n,i){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,i),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return Bn.subVectors(this.c,this.b),fi.subVectors(this.a,this.b),Bn.cross(fi).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return En.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return En.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,i,s){return En.getInterpolation(t,this.a,this.b,this.c,e,n,i,s)}containsPoint(t){return En.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return En.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){const n=this.a,i=this.b,s=this.c;let a,o;ls.subVectors(i,n),cs.subVectors(s,n),Al.subVectors(t,n);const l=ls.dot(Al),c=cs.dot(Al);if(l<=0&&c<=0)return e.copy(n);Tl.subVectors(t,i);const h=ls.dot(Tl),d=cs.dot(Tl);if(h>=0&&d<=h)return e.copy(i);const u=l*d-h*c;if(u<=0&&l>=0&&h<=0)return a=l/(l-h),e.copy(n).addScaledVector(ls,a);El.subVectors(t,s);const f=ls.dot(El),m=cs.dot(El);if(m>=0&&f<=m)return e.copy(s);const _=f*c-l*m;if(_<=0&&c>=0&&m<=0)return o=c/(c-m),e.copy(n).addScaledVector(cs,o);const p=h*m-f*d;if(p<=0&&d-h>=0&&f-m>=0)return Fh.subVectors(s,i),o=(d-h)/(d-h+(f-m)),e.copy(i).addScaledVector(Fh,o);const g=1/(p+_+u);return a=_*g,o=u*g,e.copy(n).addScaledVector(ls,a).addScaledVector(cs,o)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}}class pi{constructor(t=new L(1/0,1/0,1/0),e=new L(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(kn.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(kn.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){const n=kn.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);const n=t.geometry;if(n!==void 0){const s=n.getAttribute("position");if(e===!0&&s!==void 0&&t.isInstancedMesh!==!0)for(let a=0,o=s.count;a<o;a++)t.isMesh===!0?t.getVertexPosition(a,kn):kn.fromBufferAttribute(s,a),kn.applyMatrix4(t.matrixWorld),this.expandByPoint(kn);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),la.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),la.copy(n.boundingBox)),la.applyMatrix4(t.matrixWorld),this.union(la)}const i=t.children;for(let s=0,a=i.length;s<a;s++)this.expandByObject(i[s],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,kn),kn.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(lr),ca.subVectors(this.max,lr),hs.subVectors(t.a,lr),us.subVectors(t.b,lr),fs.subVectors(t.c,lr),Ti.subVectors(us,hs),Ei.subVectors(fs,us),Oi.subVectors(hs,fs);let e=[0,-Ti.z,Ti.y,0,-Ei.z,Ei.y,0,-Oi.z,Oi.y,Ti.z,0,-Ti.x,Ei.z,0,-Ei.x,Oi.z,0,-Oi.x,-Ti.y,Ti.x,0,-Ei.y,Ei.x,0,-Oi.y,Oi.x,0];return!Il(e,hs,us,fs,ca)||(e=[1,0,0,0,1,0,0,0,1],!Il(e,hs,us,fs,ca))?!1:(ha.crossVectors(Ti,Ei),e=[ha.x,ha.y,ha.z],Il(e,hs,us,fs,ca))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,kn).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(kn).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(mi[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),mi[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),mi[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),mi[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),mi[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),mi[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),mi[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),mi[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(mi),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}}const mi=[new L,new L,new L,new L,new L,new L,new L,new L],kn=new L,la=new pi,hs=new L,us=new L,fs=new L,Ti=new L,Ei=new L,Oi=new L,lr=new L,ca=new L,ha=new L,Bi=new L;function Il(r,t,e,n,i){for(let s=0,a=r.length-3;s<=a;s+=3){Bi.fromArray(r,s);const o=i.x*Math.abs(Bi.x)+i.y*Math.abs(Bi.y)+i.z*Math.abs(Bi.z),l=t.dot(Bi),c=e.dot(Bi),h=n.dot(Bi);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>o)return!1}return!0}const ke=new L,ua=new ft;let Pp=0;class Pe extends bi{constructor(t,e,n=!1){if(super(),Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Pp++}),this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=_h,this.updateRanges=[],this.gpuType=wn,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let i=0,s=this.itemSize;i<s;i++)this.array[t+i]=e.array[n+i];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)ua.fromBufferAttribute(this,e),ua.applyMatrix3(t),this.setXY(e,ua.x,ua.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)ke.fromBufferAttribute(this,e),ke.applyMatrix3(t),this.setXYZ(e,ke.x,ke.y,ke.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)ke.fromBufferAttribute(this,e),ke.applyMatrix4(t),this.setXYZ(e,ke.x,ke.y,ke.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)ke.fromBufferAttribute(this,e),ke.applyNormalMatrix(t),this.setXYZ(e,ke.x,ke.y,ke.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)ke.fromBufferAttribute(this,e),ke.transformDirection(t),this.setXYZ(e,ke.x,ke.y,ke.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=zn(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=me(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=zn(e,this.array)),e}setX(t,e){return this.normalized&&(e=me(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=zn(e,this.array)),e}setY(t,e){return this.normalized&&(e=me(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=zn(e,this.array)),e}setZ(t,e){return this.normalized&&(e=me(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=zn(e,this.array)),e}setW(t,e){return this.normalized&&(e=me(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=me(e,this.array),n=me(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,i){return t*=this.itemSize,this.normalized&&(e=me(e,this.array),n=me(n,this.array),i=me(i,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this}setXYZW(t,e,n,i,s){return t*=this.itemSize,this.normalized&&(e=me(e,this.array),n=me(n,this.array),i=me(i,this.array),s=me(s,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this.array[t+3]=s,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return t.name=this.name,t.usage=this.usage,t.gpuType=this.gpuType,t}dispose(){this.dispatchEvent({type:"dispose"})}}class zh extends Pe{constructor(t,e,n){super(new Uint16Array(t),e,n)}}class Oh extends Pe{constructor(t,e,n){super(new Uint32Array(t),e,n)}}class Zt extends Pe{constructor(t,e,n){super(new Float32Array(t),e,n)}}const Ip=new pi,cr=new L,Ll=new L;class $n{constructor(t=new L,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){const n=this.center;e!==void 0?n.copy(e):Ip.setFromPoints(t).getCenter(n);let i=0;for(let s=0,a=t.length;s<a;s++)i=Math.max(i,n.distanceToSquared(t[s]));return this.radius=Math.sqrt(i),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){const e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){const n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;cr.subVectors(t,this.center);const e=cr.lengthSq();if(e>this.radius*this.radius){const n=Math.sqrt(e),i=(n-this.radius)*.5;this.center.addScaledVector(cr,i/n),this.radius+=i}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(Ll.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(cr.copy(t.center).add(Ll)),this.expandByPoint(cr.copy(t.center).sub(Ll))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}}let Lp=0;const Cn=new It,Dl=new Ae,ds=new L,_n=new pi,hr=new pi,Ke=new L;class ve extends bi{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Lp++}),this.uuid=An(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new($d(t)?Oh:zh)(t,1):this.index=t,this}setIndirect(t,e=0){return this.indirect=t,this.indirectOffset=e,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){const e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const s=new Wt().getNormalMatrix(t);n.applyNormalMatrix(s),n.needsUpdate=!0}const i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(t),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(t){return Cn.makeRotationFromQuaternion(t),this.applyMatrix4(Cn),this}rotateX(t){return Cn.makeRotationX(t),this.applyMatrix4(Cn),this}rotateY(t){return Cn.makeRotationY(t),this.applyMatrix4(Cn),this}rotateZ(t){return Cn.makeRotationZ(t),this.applyMatrix4(Cn),this}translate(t,e,n){return Cn.makeTranslation(t,e,n),this.applyMatrix4(Cn),this}scale(t,e,n){return Cn.makeScale(t,e,n),this.applyMatrix4(Cn),this}lookAt(t){return Dl.lookAt(t),Dl.updateMatrix(),this.applyMatrix4(Dl.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(ds).negate(),this.translate(ds.x,ds.y,ds.z),this}setFromPoints(t){const e=this.getAttribute("position");if(e===void 0){const n=[];for(let i=0,s=t.length;i<s;i++){const a=t[i];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new Zt(n,3))}else{const n=Math.min(t.length,e.count);for(let i=0;i<n;i++){const s=t[i];e.setXYZ(i,s.x,s.y,s.z||0)}t.length>e.count&&Nt("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new pi);const t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Ot("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new L(-1/0,-1/0,-1/0),new L(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,i=e.length;n<i;n++){const s=e[n];_n.setFromBufferAttribute(s),this.morphTargetsRelative?(Ke.addVectors(this.boundingBox.min,_n.min),this.boundingBox.expandByPoint(Ke),Ke.addVectors(this.boundingBox.max,_n.max),this.boundingBox.expandByPoint(Ke)):(this.boundingBox.expandByPoint(_n.min),this.boundingBox.expandByPoint(_n.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Ot('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new $n);const t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Ot("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new L,1/0);return}if(t){const n=this.boundingSphere.center;if(_n.setFromBufferAttribute(t),e)for(let s=0,a=e.length;s<a;s++){const o=e[s];hr.setFromBufferAttribute(o),this.morphTargetsRelative?(Ke.addVectors(_n.min,hr.min),_n.expandByPoint(Ke),Ke.addVectors(_n.max,hr.max),_n.expandByPoint(Ke)):(_n.expandByPoint(hr.min),_n.expandByPoint(hr.max))}_n.getCenter(n);let i=0;for(let s=0,a=t.count;s<a;s++)Ke.fromBufferAttribute(t,s),i=Math.max(i,n.distanceToSquared(Ke));if(e)for(let s=0,a=e.length;s<a;s++){const o=e[s],l=this.morphTargetsRelative;for(let c=0,h=o.count;c<h;c++)Ke.fromBufferAttribute(o,c),l&&(ds.fromBufferAttribute(t,c),Ke.add(ds)),i=Math.max(i,n.distanceToSquared(Ke))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&Ot('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){Ot("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const n=e.position,i=e.normal,s=e.uv;let a=this.getAttribute("tangent");(a===void 0||a.count!==n.count)&&(a=new Pe(new Float32Array(4*n.count),4),this.setAttribute("tangent",a));const o=[],l=[];for(let y=0;y<n.count;y++)o[y]=new L,l[y]=new L;const c=new L,h=new L,d=new L,u=new ft,f=new ft,m=new ft,_=new L,p=new L;function g(y,A,E){c.fromBufferAttribute(n,y),h.fromBufferAttribute(n,A),d.fromBufferAttribute(n,E),u.fromBufferAttribute(s,y),f.fromBufferAttribute(s,A),m.fromBufferAttribute(s,E),h.sub(c),d.sub(c),f.sub(u),m.sub(u);const P=1/(f.x*m.y-m.x*f.y);isFinite(P)&&(_.copy(h).multiplyScalar(m.y).addScaledVector(d,-f.y).multiplyScalar(P),p.copy(d).multiplyScalar(f.x).addScaledVector(h,-m.x).multiplyScalar(P),o[y].add(_),o[A].add(_),o[E].add(_),l[y].add(p),l[A].add(p),l[E].add(p))}let v=this.groups;v.length===0&&(v=[{start:0,count:t.count}]);for(let y=0,A=v.length;y<A;++y){const E=v[y],P=E.start,D=E.count;for(let N=P,R=P+D;N<R;N+=3)g(t.getX(N+0),t.getX(N+1),t.getX(N+2))}const M=new L,x=new L,b=new L,S=new L;function T(y){b.fromBufferAttribute(i,y),S.copy(b);const A=o[y];M.copy(A),M.sub(b.multiplyScalar(b.dot(A))).normalize(),x.crossVectors(S,A);const P=x.dot(l[y])<0?-1:1;a.setXYZW(y,M.x,M.y,M.z,P)}for(let y=0,A=v.length;y<A;++y){const E=v[y],P=E.start,D=E.count;for(let N=P,R=P+D;N<R;N+=3)T(t.getX(N+0)),T(t.getX(N+1)),T(t.getX(N+2))}this._transformed=!0}computeVertexNormals(){const t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==e.count)n=new Pe(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let u=0,f=n.count;u<f;u++)n.setXYZ(u,0,0,0);const i=new L,s=new L,a=new L,o=new L,l=new L,c=new L,h=new L,d=new L;if(t)for(let u=0,f=t.count;u<f;u+=3){const m=t.getX(u+0),_=t.getX(u+1),p=t.getX(u+2);i.fromBufferAttribute(e,m),s.fromBufferAttribute(e,_),a.fromBufferAttribute(e,p),h.subVectors(a,s),d.subVectors(i,s),h.cross(d),o.fromBufferAttribute(n,m),l.fromBufferAttribute(n,_),c.fromBufferAttribute(n,p),o.add(h),l.add(h),c.add(h),n.setXYZ(m,o.x,o.y,o.z),n.setXYZ(_,l.x,l.y,l.z),n.setXYZ(p,c.x,c.y,c.z)}else for(let u=0,f=e.count;u<f;u+=3)i.fromBufferAttribute(e,u+0),s.fromBufferAttribute(e,u+1),a.fromBufferAttribute(e,u+2),h.subVectors(a,s),d.subVectors(i,s),h.cross(d),n.setXYZ(u+0,h.x,h.y,h.z),n.setXYZ(u+1,h.x,h.y,h.z),n.setXYZ(u+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)Ke.fromBufferAttribute(t,e),Ke.normalize(),t.setXYZ(e,Ke.x,Ke.y,Ke.z)}toNonIndexed(){function t(o,l){const c=o.array,h=o.itemSize,d=o.normalized,u=new c.constructor(l.length*h);let f=0,m=0;for(let _=0,p=l.length;_<p;_++){o.isInterleavedBufferAttribute?f=l[_]*o.data.stride+o.offset:f=l[_]*h;for(let g=0;g<h;g++)u[m++]=c[f++]}return new Pe(u,h,d)}if(this.index===null)return Nt("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const e=new ve,n=this.index.array,i=this.attributes;for(const o in i){const l=i[o],c=t(l,n);e.setAttribute(o,c)}const s=this.morphAttributes;for(const o in s){const l=[],c=s[o];for(let h=0,d=c.length;h<d;h++){const u=c[h],f=t(u,n);l.push(f)}e.morphAttributes[o]=l}e.morphTargetsRelative=this.morphTargetsRelative;const a=this.groups;for(let o=0,l=a.length;o<l;o++){const c=a[o];e.addGroup(c.start,c.count,c.materialIndex)}return e}toJSON(){const t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,t.name=this.name,Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){const l=this.parameters;for(const c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};const e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});const n=this.attributes;for(const l in n){const c=n[l];t.data.attributes[l]=c.toJSON(t.data)}const i={};let s=!1;for(const l in this.morphAttributes){const c=this.morphAttributes[l],h=[];for(let d=0,u=c.length;d<u;d++){const f=c[d];h.push(f.toJSON(t.data))}h.length>0&&(i[l]=h,s=!0)}s&&(t.data.morphAttributes=i,t.data.morphTargetsRelative=this.morphTargetsRelative);const a=this.groups;a.length>0&&(t.data.groups=JSON.parse(JSON.stringify(a)));const o=this.boundingSphere;return o!==null&&(t.data.boundingSphere=o.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const e={};this.name=t.name;const n=t.index;n!==null&&this.setIndex(n.clone());const i=t.attributes;for(const c in i){const h=i[c];this.setAttribute(c,h.clone(e))}const s=t.morphAttributes;for(const c in s){const h=[],d=s[c];for(let u=0,f=d.length;u<f;u++)h.push(d[u].clone(e));this.morphAttributes[c]=h}this.morphTargetsRelative=t.morphTargetsRelative;const a=t.groups;for(let c=0,h=a.length;c<h;c++){const d=a[c];this.addGroup(d.start,d.count,d.materialIndex)}const o=t.boundingBox;o!==null&&(this.boundingBox=o.clone());const l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this._transformed=t._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}}class Bh{constructor(t,e){this.isInterleavedBuffer=!0,this.array=t,this.stride=e,this.count=t!==void 0?t.length/e:0,this.usage=_h,this.updateRanges=[],this.version=0,this.uuid=An()}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.array=new t.array.constructor(t.array),this.count=t.count,this.stride=t.stride,this.usage=t.usage,this}copyAt(t,e,n){t*=this.stride,n*=e.stride;for(let i=0,s=this.stride;i<s;i++)this.array[t+i]=e.array[n+i];return this}set(t,e=0){return this.array.set(t,e),this}clone(t){t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=An()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);const e=new this.array.constructor(t.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(e,this.stride);return n.setUsage(this.usage),n}onUpload(t){return this.onUploadCallback=t,this}toJSON(t){t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=An()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer)));const e={uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride};return e.usage=this.usage,e}}const rn=new L;class ur{constructor(t,e,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=t,this.itemSize=e,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(t){this.data.needsUpdate=t}applyMatrix4(t){for(let e=0,n=this.data.count;e<n;e++)rn.fromBufferAttribute(this,e),rn.applyMatrix4(t),this.setXYZ(e,rn.x,rn.y,rn.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)rn.fromBufferAttribute(this,e),rn.applyNormalMatrix(t),this.setXYZ(e,rn.x,rn.y,rn.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)rn.fromBufferAttribute(this,e),rn.transformDirection(t),this.setXYZ(e,rn.x,rn.y,rn.z);return this}getComponent(t,e){let n=this.array[t*this.data.stride+this.offset+e];return this.normalized&&(n=zn(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=me(n,this.array)),this.data.array[t*this.data.stride+this.offset+e]=n,this}setX(t,e){return this.normalized&&(e=me(e,this.array)),this.data.array[t*this.data.stride+this.offset]=e,this}setY(t,e){return this.normalized&&(e=me(e,this.array)),this.data.array[t*this.data.stride+this.offset+1]=e,this}setZ(t,e){return this.normalized&&(e=me(e,this.array)),this.data.array[t*this.data.stride+this.offset+2]=e,this}setW(t,e){return this.normalized&&(e=me(e,this.array)),this.data.array[t*this.data.stride+this.offset+3]=e,this}getX(t){let e=this.data.array[t*this.data.stride+this.offset];return this.normalized&&(e=zn(e,this.array)),e}getY(t){let e=this.data.array[t*this.data.stride+this.offset+1];return this.normalized&&(e=zn(e,this.array)),e}getZ(t){let e=this.data.array[t*this.data.stride+this.offset+2];return this.normalized&&(e=zn(e,this.array)),e}getW(t){let e=this.data.array[t*this.data.stride+this.offset+3];return this.normalized&&(e=zn(e,this.array)),e}setXY(t,e,n){return t=t*this.data.stride+this.offset,this.normalized&&(e=me(e,this.array),n=me(n,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this}setXYZ(t,e,n,i){return t=t*this.data.stride+this.offset,this.normalized&&(e=me(e,this.array),n=me(n,this.array),i=me(i,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=i,this}setXYZW(t,e,n,i,s){return t=t*this.data.stride+this.offset,this.normalized&&(e=me(e,this.array),n=me(n,this.array),i=me(i,this.array),s=me(s,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=i,this.data.array[t+3]=s,this}clone(t){if(t===void 0){ia("InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");const e=[];for(let n=0;n<this.count;n++){const i=n*this.data.stride+this.offset;for(let s=0;s<this.itemSize;s++)e.push(this.data.array[i+s])}return new Pe(new this.array.constructor(e),this.itemSize,this.normalized)}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.clone(t)),new ur(t.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(t){if(t===void 0){ia("InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");const e=[];for(let n=0;n<this.count;n++){const i=n*this.data.stride+this.offset;for(let s=0;s<this.itemSize;s++)e.push(this.data.array[i+s])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:e,normalized:this.normalized}}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.toJSON(t)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}const Ul=new L,Dp=new L,Up=new Wt;class Kn{constructor(t=new L(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,i){return this.normal.set(t,e,n),this.constant=i,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){const i=Ul.subVectors(n,e).cross(Dp.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(i,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){const t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e,n=!0){const i=t.delta(Ul),s=this.normal.dot(i);if(s===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;const a=-(t.start.dot(this.normal)+this.constant)/s;return n===!0&&(a<0||a>1)?null:e.copy(t.start).addScaledVector(i,a)}intersectsLine(t){const e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){const n=e||Up.getNormalMatrix(t),i=this.coplanarPoint(Ul).applyMatrix4(t),s=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(s),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(t){return this.normal.fromArray(t.normal),this.constant=t.constant,this}}let Np=0;class Mn extends bi{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Np++}),this.uuid=An(),this.name="",this.type="Material",this.blending=ji,this.side=Mi,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=ih,this.blendDst=sh,this.blendEquation=Xn,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new pt(0,0,0),this.blendAlpha=0,this.depthFunc=Ks,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=Hd,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=ul,this.stencilZFail=ul,this.stencilZPass=ul,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(const e in t){const n=t[e];if(n===void 0){Nt(`Material: parameter '${e}' has value of undefined.`);continue}const i=this[e];if(i===void 0){Nt(`Material: '${e}' is not a property of THREE.${this.type}.`);continue}i&&i.isColor?i.set(n):i&&i.isVector2&&n&&n.isVector2||i&&i.isEuler&&n&&n.isEuler||i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[e]=n}}toJSON(t){const e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});const n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,n.blending=this.blending,n.side=this.side,n.shadowSide=this.shadowSide,n.vertexColors=this.vertexColors,n.opacity=this.opacity,n.transparent=this.transparent,n.blendSrc=this.blendSrc,n.blendDst=this.blendDst,n.blendEquation=this.blendEquation,n.blendSrcAlpha=this.blendSrcAlpha,n.blendDstAlpha=this.blendDstAlpha,n.blendEquationAlpha=this.blendEquationAlpha,n.blendColor=this.blendColor.getHex(),n.blendAlpha=this.blendAlpha,n.depthFunc=this.depthFunc,n.depthTest=this.depthTest,n.depthWrite=this.depthWrite,n.colorWrite=this.colorWrite,n.clipIntersection=this.clipIntersection,n.clipShadows=this.clipShadows,n.stencilWriteMask=this.stencilWriteMask,n.stencilFunc=this.stencilFunc,n.stencilRef=this.stencilRef,n.stencilFuncMask=this.stencilFuncMask,n.stencilFail=this.stencilFail,n.stencilZFail=this.stencilZFail,n.stencilZPass=this.stencilZPass,n.stencilWrite=this.stencilWrite,n.polygonOffset=this.polygonOffset,n.polygonOffsetFactor=this.polygonOffsetFactor,n.polygonOffsetUnits=this.polygonOffsetUnits,n.dithering=this.dithering,n.alphaTest=this.alphaTest,n.alphaHash=this.alphaHash,n.alphaToCoverage=this.alphaToCoverage,n.premultipliedAlpha=this.premultipliedAlpha,n.forceSinglePass=this.forceSinglePass,n.allowOverride=this.allowOverride,n.visible=this.visible,n.toneMapped=this.toneMapped,n.name=this.name,this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(n.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(n.clippingPlanes=this.clippingPlanes.map(s=>s.toJSON())),this.rotation!==void 0&&(n.rotation=this.rotation),this.depthPacking!==void 0&&(n.depthPacking=this.depthPacking),this.linewidth!==void 0&&(n.linewidth=this.linewidth),this.linecap!==void 0&&(n.linecap=this.linecap),this.linejoin!==void 0&&(n.linejoin=this.linejoin),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.wireframe!==void 0&&(n.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(n.flatShading=this.flatShading),this.fog!==void 0&&(n.fog=this.fog),Object.keys(this.userData).length>0&&(n.userData=this.userData);function i(s){const a=[];for(const o in s){const l=s[o];delete l.metadata,a.push(l)}return a}if(e){const s=i(t.textures),a=i(t.images);s.length>0&&(n.textures=s),a.length>0&&(n.images=a)}return n}fromJSON(t,e){if(t.uuid!==void 0&&(this.uuid=t.uuid),t.name!==void 0&&(this.name=t.name),t.color!==void 0&&this.color!==void 0&&this.color.setHex(t.color),t.roughness!==void 0&&(this.roughness=t.roughness),t.metalness!==void 0&&(this.metalness=t.metalness),t.sheen!==void 0&&(this.sheen=t.sheen),t.sheenColor!==void 0&&(this.sheenColor=new pt().setHex(t.sheenColor)),t.sheenRoughness!==void 0&&(this.sheenRoughness=t.sheenRoughness),t.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(t.emissive),t.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(t.specular),t.specularIntensity!==void 0&&(this.specularIntensity=t.specularIntensity),t.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(t.specularColor),t.shininess!==void 0&&(this.shininess=t.shininess),t.clearcoat!==void 0&&(this.clearcoat=t.clearcoat),t.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=t.clearcoatRoughness),t.dispersion!==void 0&&(this.dispersion=t.dispersion),t.retroreflectivity!==void 0&&(this.retroreflectivity=t.retroreflectivity),t.iridescence!==void 0&&(this.iridescence=t.iridescence),t.iridescenceIOR!==void 0&&(this.iridescenceIOR=t.iridescenceIOR),t.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=t.iridescenceThicknessRange),t.transmission!==void 0&&(this.transmission=t.transmission),t.thickness!==void 0&&(this.thickness=t.thickness),t.attenuationDistance!==void 0&&(this.attenuationDistance=t.attenuationDistance),t.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(t.attenuationColor),t.anisotropy!==void 0&&(this.anisotropy=t.anisotropy),t.anisotropyRotation!==void 0&&(this.anisotropyRotation=t.anisotropyRotation),t.fog!==void 0&&(this.fog=t.fog),t.flatShading!==void 0&&(this.flatShading=t.flatShading),t.blending!==void 0&&(this.blending=t.blending),t.combine!==void 0&&(this.combine=t.combine),t.side!==void 0&&(this.side=t.side),t.shadowSide!==void 0&&(this.shadowSide=t.shadowSide),t.opacity!==void 0&&(this.opacity=t.opacity),t.transparent!==void 0&&(this.transparent=t.transparent),t.alphaTest!==void 0&&(this.alphaTest=t.alphaTest),t.alphaHash!==void 0&&(this.alphaHash=t.alphaHash),t.depthFunc!==void 0&&(this.depthFunc=t.depthFunc),t.depthTest!==void 0&&(this.depthTest=t.depthTest),t.depthWrite!==void 0&&(this.depthWrite=t.depthWrite),t.colorWrite!==void 0&&(this.colorWrite=t.colorWrite),t.clippingPlanes!==void 0&&(this.clippingPlanes=t.clippingPlanes.map(n=>new Kn().fromJSON(n))),t.clipIntersection!==void 0&&(this.clipIntersection=t.clipIntersection),t.clipShadows!==void 0&&(this.clipShadows=t.clipShadows),t.depthPacking!==void 0&&(this.depthPacking=t.depthPacking),t.blendSrc!==void 0&&(this.blendSrc=t.blendSrc),t.blendDst!==void 0&&(this.blendDst=t.blendDst),t.blendEquation!==void 0&&(this.blendEquation=t.blendEquation),t.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=t.blendSrcAlpha),t.blendDstAlpha!==void 0&&(this.blendDstAlpha=t.blendDstAlpha),t.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=t.blendEquationAlpha),t.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(t.blendColor),t.blendAlpha!==void 0&&(this.blendAlpha=t.blendAlpha),t.stencilWriteMask!==void 0&&(this.stencilWriteMask=t.stencilWriteMask),t.stencilFunc!==void 0&&(this.stencilFunc=t.stencilFunc),t.stencilRef!==void 0&&(this.stencilRef=t.stencilRef),t.stencilFuncMask!==void 0&&(this.stencilFuncMask=t.stencilFuncMask),t.stencilFail!==void 0&&(this.stencilFail=t.stencilFail),t.stencilZFail!==void 0&&(this.stencilZFail=t.stencilZFail),t.stencilZPass!==void 0&&(this.stencilZPass=t.stencilZPass),t.stencilWrite!==void 0&&(this.stencilWrite=t.stencilWrite),t.wireframe!==void 0&&(this.wireframe=t.wireframe),t.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=t.wireframeLinewidth),t.wireframeLinecap!==void 0&&(this.wireframeLinecap=t.wireframeLinecap),t.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=t.wireframeLinejoin),t.rotation!==void 0&&(this.rotation=t.rotation),t.linewidth!==void 0&&(this.linewidth=t.linewidth),t.linecap!==void 0&&(this.linecap=t.linecap),t.linejoin!==void 0&&(this.linejoin=t.linejoin),t.dashSize!==void 0&&(this.dashSize=t.dashSize),t.gapSize!==void 0&&(this.gapSize=t.gapSize),t.scale!==void 0&&(this.scale=t.scale),t.polygonOffset!==void 0&&(this.polygonOffset=t.polygonOffset),t.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=t.polygonOffsetFactor),t.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=t.polygonOffsetUnits),t.dithering!==void 0&&(this.dithering=t.dithering),t.alphaToCoverage!==void 0&&(this.alphaToCoverage=t.alphaToCoverage),t.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=t.premultipliedAlpha),t.forceSinglePass!==void 0&&(this.forceSinglePass=t.forceSinglePass),t.allowOverride!==void 0&&(this.allowOverride=t.allowOverride),t.visible!==void 0&&(this.visible=t.visible),t.toneMapped!==void 0&&(this.toneMapped=t.toneMapped),t.userData!==void 0&&(this.userData=t.userData),t.vertexColors!==void 0&&(typeof t.vertexColors=="number"?this.vertexColors=t.vertexColors>0:this.vertexColors=t.vertexColors),t.size!==void 0&&(this.size=t.size),t.sizeAttenuation!==void 0&&(this.sizeAttenuation=t.sizeAttenuation),t.map!==void 0&&(this.map=e[t.map]||null),t.matcap!==void 0&&(this.matcap=e[t.matcap]||null),t.alphaMap!==void 0&&(this.alphaMap=e[t.alphaMap]||null),t.bumpMap!==void 0&&(this.bumpMap=e[t.bumpMap]||null),t.bumpScale!==void 0&&(this.bumpScale=t.bumpScale),t.normalMap!==void 0&&(this.normalMap=e[t.normalMap]||null),t.normalMapType!==void 0&&(this.normalMapType=t.normalMapType),t.normalScale!==void 0){let n=t.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new ft().fromArray(n)}return t.displacementMap!==void 0&&(this.displacementMap=e[t.displacementMap]||null),t.displacementScale!==void 0&&(this.displacementScale=t.displacementScale),t.displacementBias!==void 0&&(this.displacementBias=t.displacementBias),t.roughnessMap!==void 0&&(this.roughnessMap=e[t.roughnessMap]||null),t.metalnessMap!==void 0&&(this.metalnessMap=e[t.metalnessMap]||null),t.emissiveMap!==void 0&&(this.emissiveMap=e[t.emissiveMap]||null),t.emissiveIntensity!==void 0&&(this.emissiveIntensity=t.emissiveIntensity),t.specularMap!==void 0&&(this.specularMap=e[t.specularMap]||null),t.specularIntensityMap!==void 0&&(this.specularIntensityMap=e[t.specularIntensityMap]||null),t.specularColorMap!==void 0&&(this.specularColorMap=e[t.specularColorMap]||null),t.envMap!==void 0&&(this.envMap=e[t.envMap]||null),t.envMapRotation!==void 0&&this.envMapRotation.fromArray(t.envMapRotation),t.envMapIntensity!==void 0&&(this.envMapIntensity=t.envMapIntensity),t.reflectivity!==void 0&&(this.reflectivity=t.reflectivity),t.refractionRatio!==void 0&&(this.refractionRatio=t.refractionRatio),t.lightMap!==void 0&&(this.lightMap=e[t.lightMap]||null),t.lightMapIntensity!==void 0&&(this.lightMapIntensity=t.lightMapIntensity),t.aoMap!==void 0&&(this.aoMap=e[t.aoMap]||null),t.aoMapIntensity!==void 0&&(this.aoMapIntensity=t.aoMapIntensity),t.gradientMap!==void 0&&(this.gradientMap=e[t.gradientMap]||null),t.clearcoatMap!==void 0&&(this.clearcoatMap=e[t.clearcoatMap]||null),t.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=e[t.clearcoatRoughnessMap]||null),t.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=e[t.clearcoatNormalMap]||null),t.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new ft().fromArray(t.clearcoatNormalScale)),t.iridescenceMap!==void 0&&(this.iridescenceMap=e[t.iridescenceMap]||null),t.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=e[t.iridescenceThicknessMap]||null),t.transmissionMap!==void 0&&(this.transmissionMap=e[t.transmissionMap]||null),t.thicknessMap!==void 0&&(this.thicknessMap=e[t.thicknessMap]||null),t.anisotropyMap!==void 0&&(this.anisotropyMap=e[t.anisotropyMap]||null),t.sheenColorMap!==void 0&&(this.sheenColorMap=e[t.sheenColorMap]||null),t.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=e[t.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;const e=t.clippingPlanes;let n=null;if(e!==null){const i=e.length;n=new Array(i);for(let s=0;s!==i;++s)n[s]=e[s].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.allowOverride=t.allowOverride,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}}class kh extends Mn{constructor(t){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new pt(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.rotation=t.rotation,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}}let ps;const fr=new L,ms=new L,gs=new L,xs=new ft,dr=new ft,Vh=new It,fa=new L,pr=new L,da=new L,Hh=new ft,Nl=new ft,Gh=new ft;class Fp extends Ae{constructor(t=new kh){if(super(),this.isSprite=!0,this.type="Sprite",ps===void 0){ps=new ve;const e=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new Bh(e,5);ps.setIndex([0,1,2,0,2,3]),ps.setAttribute("position",new ur(n,3,0,!1)),ps.setAttribute("uv",new ur(n,2,3,!1))}this.geometry=ps,this.material=t,this.center=new ft(.5,.5),this.count=1}intersectsFrustum(t){return t.intersectsSprite(this)}raycast(t,e){t.camera===null&&Ot('Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),ms.setFromMatrixScale(this.matrixWorld),Vh.copy(t.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(t.camera.matrixWorldInverse,this.matrixWorld),gs.setFromMatrixPosition(this.modelViewMatrix),t.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&ms.multiplyScalar(-gs.z);const n=this.material.rotation;let i,s;n!==0&&(s=Math.cos(n),i=Math.sin(n));const a=this.center;pa(fa.set(-.5,-.5,0),gs,a,ms,i,s),pa(pr.set(.5,-.5,0),gs,a,ms,i,s),pa(da.set(.5,.5,0),gs,a,ms,i,s),Hh.set(0,0),Nl.set(1,0),Gh.set(1,1);let o=t.ray.intersectTriangle(fa,pr,da,!1,fr);if(o===null&&(pa(pr.set(-.5,.5,0),gs,a,ms,i,s),Nl.set(0,1),o=t.ray.intersectTriangle(fa,da,pr,!1,fr),o===null))return;const l=t.ray.origin.distanceTo(fr);l<t.near||l>t.far||e.push({distance:l,point:fr.clone(),uv:En.getInterpolation(fr,fa,pr,da,Hh,Nl,Gh,new ft),face:null,object:this})}copy(t,e){return super.copy(t,e),t.center!==void 0&&this.center.copy(t.center),this.material=t.material,this}}function pa(r,t,e,n,i,s){xs.subVectors(r,e).addScalar(.5).multiply(n),i!==void 0?(dr.x=s*xs.x-i*xs.y,dr.y=i*xs.x+s*xs.y):dr.copy(xs),r.copy(t),r.x+=dr.x,r.y+=dr.y,r.applyMatrix4(Vh)}const gi=new L,Fl=new L,ma=new L,ga=new L;class vs{constructor(t=new L,e=new L(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,gi)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);const n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){const e=gi.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(gi.copy(this.origin).addScaledVector(this.direction,e),gi.distanceToSquared(t))}distanceSqToSegment(t,e,n,i){Fl.copy(t).add(e).multiplyScalar(.5),ma.copy(e).sub(t).normalize(),ga.copy(this.origin).sub(Fl);const s=t.distanceTo(e)*.5,a=-this.direction.dot(ma),o=ga.dot(this.direction),l=-ga.dot(ma),c=ga.lengthSq(),h=Math.abs(1-a*a);let d,u,f,m;if(h>0)if(d=a*l-o,u=a*o-l,m=s*h,d>=0)if(u>=-m)if(u<=m){const _=1/h;d*=_,u*=_,f=d*(d+a*u+2*o)+u*(a*d+u+2*l)+c}else u=s,d=Math.max(0,-(a*u+o)),f=-d*d+u*(u+2*l)+c;else u=-s,d=Math.max(0,-(a*u+o)),f=-d*d+u*(u+2*l)+c;else u<=-m?(d=Math.max(0,-(-a*s+o)),u=d>0?-s:Math.min(Math.max(-s,-l),s),f=-d*d+u*(u+2*l)+c):u<=m?(d=0,u=Math.min(Math.max(-s,-l),s),f=u*(u+2*l)+c):(d=Math.max(0,-(a*s+o)),u=d>0?s:Math.min(Math.max(-s,-l),s),f=-d*d+u*(u+2*l)+c);else u=a>0?-s:s,d=Math.max(0,-(a*u+o)),f=-d*d+u*(u+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,d),i&&i.copy(Fl).addScaledVector(ma,u),f}intersectSphere(t,e){if(t.radius<0)return null;gi.subVectors(t.center,this.origin);const n=gi.dot(this.direction),i=gi.dot(gi)-n*n,s=t.radius*t.radius;if(i>s)return null;const a=Math.sqrt(s-i),o=n-a,l=n+a;return l<0?null:o<0?this.at(l,e):this.at(o,e)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){const e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){const n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){const e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,i,s,a,o,l;const c=1/this.direction.x,h=1/this.direction.y,d=1/this.direction.z,u=this.origin;return c>=0?(n=(t.min.x-u.x)*c,i=(t.max.x-u.x)*c):(n=(t.max.x-u.x)*c,i=(t.min.x-u.x)*c),h>=0?(s=(t.min.y-u.y)*h,a=(t.max.y-u.y)*h):(s=(t.max.y-u.y)*h,a=(t.min.y-u.y)*h),n>a||s>i||((s>n||isNaN(n))&&(n=s),(a<i||isNaN(i))&&(i=a),d>=0?(o=(t.min.z-u.z)*d,l=(t.max.z-u.z)*d):(o=(t.max.z-u.z)*d,l=(t.min.z-u.z)*d),n>l||o>i)||((o>n||n!==n)&&(n=o),(l<i||i!==i)&&(i=l),i<0)?null:this.at(n>=0?n:i,e)}intersectsBox(t){return this.intersectBox(t,gi)!==null}intersectTriangle(t,e,n,i,s){const a=this.origin,o=this.direction,l=o.x,c=o.y,h=o.z,d=t.x-a.x,u=t.y-a.y,f=t.z-a.z,m=e.x-a.x,_=e.y-a.y,p=e.z-a.z,g=n.x-a.x,v=n.y-a.y,M=n.z-a.z,x=Math.abs(l),b=Math.abs(c),S=Math.abs(h);let T,y,A,E,P,D,N,R,B,V,Y,it;if(x>=b&&x>=S?(A=l,D=d,B=m,it=g,l>=0?(T=c,y=h,E=u,P=f,N=_,R=p,V=v,Y=M):(T=h,y=c,E=f,P=u,N=p,R=_,V=M,Y=v)):b>=S?(A=c,D=u,B=_,it=v,c>=0?(T=h,y=l,E=f,P=d,N=p,R=m,V=M,Y=g):(T=l,y=h,E=d,P=f,N=m,R=p,V=g,Y=M)):(A=h,D=f,B=p,it=M,h>=0?(T=l,y=c,E=d,P=u,N=m,R=_,V=g,Y=v):(T=c,y=l,E=u,P=d,N=_,R=m,V=v,Y=g)),A===0)return null;const Z=T/A,j=y/A,ct=1/A,xt=E-Z*D,_t=P-j*D,kt=N-Z*B,zt=R-j*B,Dt=V-Z*it,st=Y-j*it,rt=Dt*zt-st*kt,Mt=xt*st-_t*Dt,Lt=kt*_t-zt*xt;if(i){if(rt<0||Mt<0||Lt<0)return null}else if((rt<0||Mt<0||Lt<0)&&(rt>0||Mt>0||Lt>0))return null;const yt=rt+Mt+Lt;if(yt===0)return null;const Bt=ct*(rt*D+Mt*B+Lt*it);return(yt>0?Bt<0:Bt>0)?null:this.at(Bt/yt,s)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class Te extends Mn{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new pt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Tn,this.combine=_o,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}}const Wh=new It,ki=new vs,xa=new $n,Xh=new L,va=new L,_a=new L,Ma=new L,zl=new L,ya=new L,Yh=new L,Sa=new L;class Xt extends Ae{constructor(t=new ve,e=new Te){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,a=i.length;s<a;s++){const o=i[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=s}}}}getVertexPosition(t,e){const n=this.geometry,i=n.attributes.position,s=n.morphAttributes.position,a=n.morphTargetsRelative;e.fromBufferAttribute(i,t);const o=this.morphTargetInfluences;if(s&&o){ya.set(0,0,0);for(let l=0,c=s.length;l<c;l++){const h=o[l],d=s[l];h!==0&&(zl.fromBufferAttribute(d,t),a?ya.addScaledVector(zl,h):ya.addScaledVector(zl.sub(e),h))}e.add(ya)}return e}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,e){const n=this.geometry,i=this.material,s=this.matrixWorld;i!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),xa.copy(n.boundingSphere),xa.applyMatrix4(s),ki.copy(t.ray).recast(t.near),!(xa.containsPoint(ki.origin)===!1&&(ki.intersectSphere(xa,Xh)===null||ki.origin.distanceToSquared(Xh)>(t.far-t.near)**2))&&(Wh.copy(s).invert(),ki.copy(t.ray).applyMatrix4(Wh),!(n.boundingBox!==null&&ki.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,ki)))}_computeIntersections(t,e,n){let i;const s=this.geometry,a=this.material,o=s.index,l=s.attributes.position,c=s.attributes.uv,h=s.attributes.uv1,d=s.attributes.normal,u=s.groups,f=s.drawRange;if(o!==null)if(Array.isArray(a))for(let m=0,_=u.length;m<_;m++){const p=u[m],g=a[p.materialIndex],v=Math.max(p.start,f.start),M=Math.min(o.count,Math.min(p.start+p.count,f.start+f.count));for(let x=v,b=M;x<b;x+=3){const S=o.getX(x),T=o.getX(x+1),y=o.getX(x+2);i=ba(this,g,t,n,c,h,d,S,T,y),i&&(i.faceIndex=Math.floor(x/3),i.face.materialIndex=p.materialIndex,e.push(i))}}else{const m=Math.max(0,f.start),_=Math.min(o.count,f.start+f.count);for(let p=m,g=_;p<g;p+=3){const v=o.getX(p),M=o.getX(p+1),x=o.getX(p+2);i=ba(this,a,t,n,c,h,d,v,M,x),i&&(i.faceIndex=Math.floor(p/3),e.push(i))}}else if(l!==void 0)if(Array.isArray(a))for(let m=0,_=u.length;m<_;m++){const p=u[m],g=a[p.materialIndex],v=Math.max(p.start,f.start),M=Math.min(l.count,Math.min(p.start+p.count,f.start+f.count));for(let x=v,b=M;x<b;x+=3){const S=x,T=x+1,y=x+2;i=ba(this,g,t,n,c,h,d,S,T,y),i&&(i.faceIndex=Math.floor(x/3),i.face.materialIndex=p.materialIndex,e.push(i))}}else{const m=Math.max(0,f.start),_=Math.min(l.count,f.start+f.count);for(let p=m,g=_;p<g;p+=3){const v=p,M=p+1,x=p+2;i=ba(this,a,t,n,c,h,d,v,M,x),i&&(i.faceIndex=Math.floor(p/3),e.push(i))}}}}function zp(r,t,e,n,i,s,a,o){let l;if(t.side===nn?l=n.intersectTriangle(a,s,i,!0,o):l=n.intersectTriangle(i,s,a,t.side===Mi,o),l===null)return null;Sa.copy(o),Sa.applyMatrix4(r.matrixWorld);const c=e.ray.origin.distanceTo(Sa);return c<e.near||c>e.far?null:{distance:c,point:Sa.clone(),object:r}}function ba(r,t,e,n,i,s,a,o,l,c){r.getVertexPosition(o,va),r.getVertexPosition(l,_a),r.getVertexPosition(c,Ma);const h=zp(r,t,e,n,va,_a,Ma,Yh);if(h){const d=new L;En.getBarycoord(Yh,va,_a,Ma,d),i&&(h.uv=En.getInterpolatedAttribute(i,o,l,c,d,new ft)),s&&(h.uv1=En.getInterpolatedAttribute(s,o,l,c,d,new ft)),a&&(h.normal=En.getInterpolatedAttribute(a,o,l,c,d,new L),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));const u={a:o,b:l,c,normal:new L,materialIndex:0};En.getNormal(va,_a,Ma,u.normal),h.face=u,h.barycoord=d}return h}const mr=new ue,qh=new ue,Zh=new ue,Op=new ue,$h=new It,wa=new L,Ol=new $n,Kh=new It,Bl=new vs;class Bp extends Xt{constructor(t,e){super(t,e),this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode=rh,this.bindMatrix=new It,this.bindMatrixInverse=new It,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){const t=this.geometry;this.boundingBox===null&&(this.boundingBox=new pi),this.boundingBox.makeEmpty();const e=t.getAttribute("position");for(let n=0;n<e.count;n++)this.getVertexPosition(n,wa),this.boundingBox.expandByPoint(wa)}computeBoundingSphere(){const t=this.geometry;this.boundingSphere===null&&(this.boundingSphere=new $n),this.boundingSphere.makeEmpty();const e=t.getAttribute("position");for(let n=0;n<e.count;n++)this.getVertexPosition(n,wa),this.boundingSphere.expandByPoint(wa)}copy(t,e){return super.copy(t,e),this.bindMode=t.bindMode,this.bindMatrix.copy(t.bindMatrix),this.bindMatrixInverse.copy(t.bindMatrixInverse),this.skeleton=t.skeleton,t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone()),t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),this}raycast(t,e){const n=this.material,i=this.matrixWorld;n!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Ol.copy(this.boundingSphere),Ol.applyMatrix4(i),t.ray.intersectsSphere(Ol)!==!1&&(Kh.copy(i).invert(),Bl.copy(t.ray).applyMatrix4(Kh),!(this.boundingBox!==null&&Bl.intersectsBox(this.boundingBox)===!1)&&this._computeIntersections(t,e,Bl)))}getVertexPosition(t,e){return super.getVertexPosition(t,e),this.applyBoneTransform(t,e),e}bind(t,e){this.skeleton=t,e===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),e=this.matrixWorld),this.bindMatrix.copy(e),this.bindMatrixInverse.copy(e).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){const t=new ue,e=this.geometry.attributes.skinWeight;for(let n=0,i=e.count;n<i;n++){t.fromBufferAttribute(e,n);const s=1/t.manhattanLength();s!==1/0?t.multiplyScalar(s):t.set(1,0,0,0),e.setXYZW(n,t.x,t.y,t.z,t.w)}}updateMatrixWorld(t){super.updateMatrixWorld(t),this.bindMode===rh?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode===zd?this.bindMatrixInverse.copy(this.bindMatrix).invert():Nt("SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}applyBoneTransform(t,e){const n=this.skeleton,i=this.geometry;qh.fromBufferAttribute(i.attributes.skinIndex,t),Zh.fromBufferAttribute(i.attributes.skinWeight,t),e.isVector4?(mr.copy(e),e.set(0,0,0,0)):(mr.set(...e,1),e.set(0,0,0)),mr.applyMatrix4(this.bindMatrix);for(let s=0;s<4;s++){const a=Zh.getComponent(s);if(a!==0){const o=qh.getComponent(s);$h.multiplyMatrices(n.bones[o].matrixWorld,n.boneInverses[o]),e.addScaledVector(Op.copy(mr).applyMatrix4($h),a)}}return e.isVector4&&(e.w=mr.w),e.applyMatrix4(this.bindMatrixInverse)}}class Jh extends Ae{constructor(){super(),this.isBone=!0,this.type="Bone"}}class _s extends Re{constructor(t=null,e=1,n=1,i,s,a,o,l,c=Ue,h=Ue,d,u){super(null,a,o,l,c,h,i,s,d,u),this.isDataTexture=!0,this.image={data:t,width:e,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}const jh=new It,kp=new It;class kl{constructor(t=[],e=[]){this.uuid=An(),this.bones=t.slice(0),this.boneInverses=e,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){const t=this.bones,e=this.boneInverses;if(this.boneMatrices=new Float32Array(t.length*16),e.length===0)this.calculateInverses();else if(t.length!==e.length){Nt("Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,i=this.bones.length;n<i;n++)this.boneInverses.push(new It)}}calculateInverses(){this.boneInverses.length=0;for(let t=0,e=this.bones.length;t<e;t++){const n=new It;this.bones[t]&&n.copy(this.bones[t].matrixWorld).invert(),this.boneInverses.push(n)}}pose(){for(let t=0,e=this.bones.length;t<e;t++){const n=this.bones[t];n&&n.matrixWorld.copy(this.boneInverses[t]).invert()}for(let t=0,e=this.bones.length;t<e;t++){const n=this.bones[t];n&&(n.parent&&n.parent.isBone?(n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld)):n.matrix.copy(n.matrixWorld),n.matrix.decompose(n.position,n.quaternion,n.scale))}}update(){const t=this.bones,e=this.boneInverses,n=this.boneMatrices,i=this.boneTexture;for(let s=0,a=t.length;s<a;s++){const o=t[s]?t[s].matrixWorld:kp;jh.multiplyMatrices(o,e[s]),jh.toArray(n,s*16)}i!==null&&(i.needsUpdate=!0)}clone(){return new kl(this.bones,this.boneInverses)}computeBoneTexture(){let t=Math.sqrt(this.bones.length*4);t=Math.ceil(t/4)*4,t=Math.max(t,4);const e=new Float32Array(t*t*4);e.set(this.boneMatrices);const n=new _s(e,t,t,gn,wn);return n.needsUpdate=!0,this.boneMatrices=e,this.boneTexture=n,this}getBoneByName(t){for(let e=0,n=this.bones.length;e<n;e++){const i=this.bones[e];if(i.name===t)return i}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null)}fromJSON(t,e){this.uuid=t.uuid;for(let n=0,i=t.bones.length;n<i;n++){const s=t.bones[n];let a=e[s];a===void 0&&(Nt("Skeleton: No bone found with UUID:",s),a=new Jh),this.bones.push(a),this.boneInverses.push(new It().fromArray(t.boneInverses[n]))}return this.init(),this}toJSON(){const t={metadata:{version:4.7,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};t.uuid=this.uuid;const e=this.bones,n=this.boneInverses;for(let i=0,s=e.length;i<s;i++){const a=e[i];t.bones.push(a.uuid);const o=n[i];t.boneInverses.push(o.toArray())}return t}}class Vi extends Pe{constructor(t,e,n,i=1){super(t,e,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=i}copy(t){return super.copy(t),this.meshPerAttribute=t.meshPerAttribute,this}toJSON(){const t=super.toJSON();return t.meshPerAttribute=this.meshPerAttribute,t.isInstancedBufferAttribute=!0,t}}const Ms=new It,Qh=new It,Aa=[],tu=new pi,Vp=new It,gr=new Xt,xr=new $n;class De extends Xt{constructor(t,e,n){super(t,e),this.isInstancedMesh=!0,this.instanceMatrix=new Vi(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let i=0;i<n;i++)this.setMatrixAt(i,Vp)}computeBoundingBox(){const t=this.geometry,e=this.count;this.boundingBox===null&&(this.boundingBox=new pi),t.boundingBox===null&&t.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,Ms),tu.copy(t.boundingBox).applyMatrix4(Ms),this.boundingBox.union(tu)}computeBoundingSphere(){const t=this.geometry,e=this.count;this.boundingSphere===null&&(this.boundingSphere=new $n),t.boundingSphere===null&&t.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,Ms),xr.copy(t.boundingSphere).applyMatrix4(Ms),this.boundingSphere.union(xr)}copy(t,e){return super.copy(t,e),this.instanceMatrix.copy(t.instanceMatrix),t.morphTexture!==null&&(this.morphTexture=t.morphTexture.clone()),t.instanceColor!==null&&(this.instanceColor=t.instanceColor.clone()),this.count=t.count,t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone()),t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),this}getColorAt(t,e){return this.instanceColor===null?e.setRGB(1,1,1):e.fromArray(this.instanceColor.array,t*3)}getMatrixAt(t,e){return e.fromArray(this.instanceMatrix.array,t*16)}getMorphAt(t,e){const n=e.morphTargetInfluences,i=this.morphTexture.source.data.data,s=n.length+1,a=t*s+1;for(let o=0;o<n.length;o++)n[o]=i[a+o]}raycast(t,e){const n=this.matrixWorld,i=this.count;if(gr.geometry=this.geometry,gr.material=this.material,gr.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),xr.copy(this.boundingSphere),xr.applyMatrix4(n),t.ray.intersectsSphere(xr)!==!1))for(let s=0;s<i;s++){this.getMatrixAt(s,Ms),Qh.multiplyMatrices(n,Ms),gr.matrixWorld=Qh,gr.raycast(t,Aa);for(let a=0,o=Aa.length;a<o;a++){const l=Aa[a];l.instanceId=s,l.object=this,e.push(l)}Aa.length=0}}setColorAt(t,e){return this.instanceColor===null&&(this.instanceColor=new Vi(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),e.toArray(this.instanceColor.array,t*3),this}setMatrixAt(t,e){return e.toArray(this.instanceMatrix.array,t*16),this}setMorphAt(t,e){const n=e.morphTargetInfluences,i=n.length+1;this.morphTexture===null&&(this.morphTexture=new _s(new Float32Array(i*this.count),i,this.count,$r,wn));const s=this.morphTexture.source.data.data;let a=0;for(let c=0;c<n.length;c++)a+=n[c];const o=this.geometry.morphTargetsRelative?1:1-a,l=i*t;return s[l]=o,s.set(n,l+1),this}updateMorphTargets(){}dispose(){super.dispose(),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}}const Hi=new $n,Hp=new ft(.5,.5),Ta=new L;class Vl{constructor(t=new Kn,e=new Kn,n=new Kn,i=new Kn,s=new Kn,a=new Kn){this.planes=[t,e,n,i,s,a]}set(t,e,n,i,s,a){const o=this.planes;return o[0].copy(t),o[1].copy(e),o[2].copy(n),o[3].copy(i),o[4].copy(s),o[5].copy(a),this}copy(t){const e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=Zn,n=!1){const i=this.planes,s=t.elements,a=s[0],o=s[1],l=s[2],c=s[3],h=s[4],d=s[5],u=s[6],f=s[7],m=s[8],_=s[9],p=s[10],g=s[11],v=s[12],M=s[13],x=s[14],b=s[15];if(i[0].setComponents(c-a,f-h,g-m,b-v).normalize(),i[1].setComponents(c+a,f+h,g+m,b+v).normalize(),i[2].setComponents(c+o,f+d,g+_,b+M).normalize(),i[3].setComponents(c-o,f-d,g-_,b-M).normalize(),n)i[4].setComponents(l,u,p,x).normalize(),i[5].setComponents(c-l,f-u,g-p,b-x).normalize();else if(i[4].setComponents(c-l,f-u,g-p,b-x).normalize(),e===Zn)i[5].setComponents(c+l,f+u,g+p,b+x).normalize();else if(e===nr)i[5].setComponents(l,u,p,x).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),Hi.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{const e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),Hi.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(Hi)}intersectsSprite(t){Hi.center.set(0,0,0);const e=Hp.distanceTo(t.center);return Hi.radius=.7071067811865476+e,Hi.applyMatrix4(t.matrixWorld),this.intersectsSphere(Hi)}intersectsSphere(t){const e=this.planes,n=t.center,i=-t.radius;for(let s=0;s<6;s++)if(e[s].distanceToPoint(n)<i)return!1;return!0}intersectsBox(t){const e=this.planes;for(let n=0;n<6;n++){const i=e[n];if(Ta.x=i.normal.x>0?t.max.x:t.min.x,Ta.y=i.normal.y>0?t.max.y:t.min.y,Ta.z=i.normal.z>0?t.max.z:t.min.z,i.distanceToPoint(Ta)<0)return!1}return!0}containsPoint(t){const e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class eu extends Mn{constructor(t){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new pt(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.linewidth=t.linewidth,this.linecap=t.linecap,this.linejoin=t.linejoin,this.fog=t.fog,this}}const Ea=new L,Ca=new L,nu=new It,vr=new vs,Ra=new $n,Hl=new L,iu=new L;class Gl extends Ae{constructor(t=new ve,e=new eu){super(),this.isLine=!0,this.type="Line",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}computeLineDistances(){const t=this.geometry;if(t.index===null){const e=t.attributes.position,n=[0];for(let i=1,s=e.count;i<s;i++)Ea.fromBufferAttribute(e,i-1),Ca.fromBufferAttribute(e,i),n[i]=n[i-1],n[i]+=Ea.distanceTo(Ca);t.setAttribute("lineDistance",new Zt(n,1))}else Nt("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,e){const n=this.geometry,i=this.matrixWorld,s=t.params.Line.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Ra.copy(n.boundingSphere),Ra.applyMatrix4(i),Ra.radius+=s,t.ray.intersectsSphere(Ra)===!1)return;nu.copy(i).invert(),vr.copy(t.ray).applyMatrix4(nu);const o=s/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=this.isLineSegments?2:1,h=n.index,u=n.attributes.position;if(h!==null){const f=Math.max(0,a.start),m=Math.min(h.count,a.start+a.count);for(let _=f,p=m-1;_<p;_+=c){const g=h.getX(_),v=h.getX(_+1),M=Pa(this,t,vr,l,g,v,_);M&&e.push(M)}if(this.isLineLoop){const _=h.getX(m-1),p=h.getX(f),g=Pa(this,t,vr,l,_,p,m-1);g&&e.push(g)}}else{const f=Math.max(0,a.start),m=Math.min(u.count,a.start+a.count);for(let _=f,p=m-1;_<p;_+=c){const g=Pa(this,t,vr,l,_,_+1,_);g&&e.push(g)}if(this.isLineLoop){const _=Pa(this,t,vr,l,m-1,f,m-1);_&&e.push(_)}}}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,a=i.length;s<a;s++){const o=i[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=s}}}}}function Pa(r,t,e,n,i,s,a){const o=r.geometry.attributes.position;if(Ea.fromBufferAttribute(o,i),Ca.fromBufferAttribute(o,s),e.distanceSqToSegment(Ea,Ca,Hl,iu)>n)return;Hl.applyMatrix4(r.matrixWorld);const c=t.ray.origin.distanceTo(Hl);if(!(c<t.near||c>t.far))return{distance:c,point:iu.clone().applyMatrix4(r.matrixWorld),index:a,face:null,faceIndex:null,barycoord:null,object:r}}const su=new L,ru=new L;class Gp extends Gl{constructor(t,e){super(t,e),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){const t=this.geometry;if(t.index===null){const e=t.attributes.position,n=[];for(let i=0,s=e.count;i<s;i+=2)su.fromBufferAttribute(e,i),ru.fromBufferAttribute(e,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+su.distanceTo(ru);t.setAttribute("lineDistance",new Zt(n,1))}else Nt("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}}class Wp extends Gl{constructor(t,e){super(t,e),this.isLineLoop=!0,this.type="LineLoop"}}class au extends Mn{constructor(t){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new pt(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.size=t.size,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}}const ou=new It,Wl=new vs,Ia=new $n,La=new L;class lu extends Ae{constructor(t=new ve,e=new au){super(),this.isPoints=!0,this.type="Points",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,e){const n=this.geometry,i=this.matrixWorld,s=t.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Ia.copy(n.boundingSphere),Ia.applyMatrix4(i),Ia.radius+=s,t.ray.intersectsSphere(Ia)===!1)return;ou.copy(i).invert(),Wl.copy(t.ray).applyMatrix4(ou);const o=s/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=n.index,d=n.attributes.position;if(c!==null){const u=Math.max(0,a.start),f=Math.min(c.count,a.start+a.count);for(let m=u,_=f;m<_;m++){const p=c.getX(m);La.fromBufferAttribute(d,p),cu(La,p,l,i,t,e,this)}}else{const u=Math.max(0,a.start),f=Math.min(d.count,a.start+a.count);for(let m=u,_=f;m<_;m++)La.fromBufferAttribute(d,m),cu(La,m,l,i,t,e,this)}}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,a=i.length;s<a;s++){const o=i[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=s}}}}}function cu(r,t,e,n,i,s,a){const o=Wl.distanceSqToPoint(r);if(o<e){const l=new L;Wl.closestPointToPoint(r,l),l.applyMatrix4(n);const c=i.ray.origin.distanceTo(l);if(c<i.near||c>i.far)return;s.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:t,face:null,faceIndex:null,barycoord:null,object:a})}}class hu extends Re{constructor(t=[],e=Fi,n,i,s,a,o,l,c,h){super(t,e,n,i,s,a,o,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}}class Xl extends Re{constructor(t,e,n,i,s,a,o,l,c){super(t,e,n,i,s,a,o,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}}class ys extends Re{constructor(t,e,n=qn,i,s,a,o=Ue,l=Ue,c,h=li,d=1){if(h!==li&&h!==yi)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const u={width:t,height:e,depth:d};super(u,i,s,a,o,l,h,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.source=new xl(Object.assign({},t.image)),this.compareFunction=t.compareFunction,this}toJSON(t){const e=super.toJSON(t);return e.compareFunction=this.compareFunction,e}}class Xp extends ys{constructor(t,e=qn,n=Fi,i,s,a=Ue,o=Ue,l,c=li){const h={width:t,height:t,depth:1},d=[h,h,h,h,h,h];super(t,t,e,n,i,s,a,o,l,c),this.image=d,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(t){this.image=t}}class uu extends Re{constructor(t=null){super(),this.sourceTexture=t,this.isExternalTexture=!0}copy(t){return super.copy(t),this.sourceTexture=t.sourceTexture,this}}class ae extends ve{constructor(t=1,e=1,n=1,i=1,s=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:i,heightSegments:s,depthSegments:a};const o=this;i=Math.floor(i),s=Math.floor(s),a=Math.floor(a);const l=[],c=[],h=[],d=[];let u=0,f=0;m("z","y","x",-1,-1,n,e,t,a,s,0),m("z","y","x",1,-1,n,e,-t,a,s,1),m("x","z","y",1,1,t,n,e,i,a,2),m("x","z","y",1,-1,t,n,-e,i,a,3),m("x","y","z",1,-1,t,e,n,i,s,4),m("x","y","z",-1,-1,t,e,-n,i,s,5),this.setIndex(l),this.setAttribute("position",new Zt(c,3)),this.setAttribute("normal",new Zt(h,3)),this.setAttribute("uv",new Zt(d,2));function m(_,p,g,v,M,x,b,S,T,y,A){const E=x/T,P=b/y,D=x/2,N=b/2,R=S/2,B=T+1,V=y+1;let Y=0,it=0;const Z=new L;for(let j=0;j<V;j++){const ct=j*P-N;for(let xt=0;xt<B;xt++){const _t=xt*E-D;Z[_]=_t*v,Z[p]=ct*M,Z[g]=R,c.push(Z.x,Z.y,Z.z),Z[_]=0,Z[p]=0,Z[g]=S>0?1:-1,h.push(Z.x,Z.y,Z.z),d.push(xt/T),d.push(1-j/y),Y+=1}}for(let j=0;j<y;j++)for(let ct=0;ct<T;ct++){const xt=u+ct+B*j,_t=u+ct+B*(j+1),kt=u+(ct+1)+B*(j+1),zt=u+(ct+1)+B*j;l.push(xt,_t,zt),l.push(_t,kt,zt),it+=6}o.addGroup(f,it,A),f+=it,u+=Y}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new ae(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}}class _r extends ve{constructor(t=1,e=32,n=0,i=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:t,segments:e,thetaStart:n,thetaLength:i},e=Math.max(3,e);const s=[],a=[],o=[],l=[],c=new L,h=new ft;a.push(0,0,0),o.push(0,0,1),l.push(.5,.5);for(let d=0,u=3;d<=e;d++,u+=3){const f=n+d/e*i;c.x=t*Math.cos(f),c.y=t*Math.sin(f),a.push(c.x,c.y,c.z),o.push(0,0,1),h.x=(a[u]/t+1)/2,h.y=(a[u+1]/t+1)/2,l.push(h.x,h.y)}for(let d=1;d<=e;d++)s.push(d,d+1,0);this.setIndex(s),this.setAttribute("position",new Zt(a,3)),this.setAttribute("normal",new Zt(o,3)),this.setAttribute("uv",new Zt(l,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new _r(t.radius,t.segments,t.thetaStart,t.thetaLength)}}class je extends ve{constructor(t=1,e=1,n=1,i=32,s=1,a=!1,o=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:e,height:n,radialSegments:i,heightSegments:s,openEnded:a,thetaStart:o,thetaLength:l};const c=this;i=Math.floor(i),s=Math.floor(s);const h=[],d=[],u=[],f=[];let m=0;const _=[],p=n/2;let g=0;v(),a===!1&&(t>0&&M(!0),e>0&&M(!1)),this.setIndex(h),this.setAttribute("position",new Zt(d,3)),this.setAttribute("normal",new Zt(u,3)),this.setAttribute("uv",new Zt(f,2));function v(){const x=new L,b=new L;let S=0;const T=(e-t)/n;for(let y=0;y<=s;y++){const A=[],E=y/s,P=E*(e-t)+t;for(let D=0;D<=i;D++){const N=D/i,R=N*l+o,B=Math.sin(R),V=Math.cos(R);b.x=P*B,b.y=-E*n+p,b.z=P*V,d.push(b.x,b.y,b.z),x.set(B,T,V).normalize(),u.push(x.x,x.y,x.z),f.push(N,1-E),A.push(m++)}_.push(A)}for(let y=0;y<i;y++)for(let A=0;A<s;A++){const E=_[A][y],P=_[A+1][y],D=_[A+1][y+1],N=_[A][y+1];(t>0||A!==0)&&(h.push(E,P,N),S+=3),(e>0||A!==s-1)&&(h.push(P,D,N),S+=3)}c.addGroup(g,S,0),g+=S}function M(x){const b=m,S=new ft,T=new L;let y=0;const A=x===!0?t:e,E=x===!0?1:-1;for(let D=1;D<=i;D++)d.push(0,p*E,0),u.push(0,E,0),f.push(.5,.5),m++;const P=m;for(let D=0;D<=i;D++){const R=D/i*l+o,B=Math.cos(R),V=Math.sin(R);T.x=A*V,T.y=p*E,T.z=A*B,d.push(T.x,T.y,T.z),u.push(0,E,0),S.x=B*.5+.5,S.y=V*.5*E+.5,f.push(S.x,S.y),m++}for(let D=0;D<i;D++){const N=b+D,R=P+D;x===!0?h.push(R,R+1,N):h.push(R+1,R,N),y+=3}c.addGroup(g,y,x===!0?1:2),g+=y}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new je(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}}class Rn extends je{constructor(t=1,e=1,n=32,i=1,s=!1,a=0,o=Math.PI*2){super(0,t,e,n,i,s,a,o),this.type="ConeGeometry",this.parameters={radius:t,height:e,radialSegments:n,heightSegments:i,openEnded:s,thetaStart:a,thetaLength:o}}static fromJSON(t){return new Rn(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}}class Mr extends ve{constructor(t=[],e=[],n=1,i=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:t,indices:e,radius:n,detail:i};const s=[],a=[];o(i),c(n),h(),this.setAttribute("position",new Zt(s,3)),this.setAttribute("normal",new Zt(s.slice(),3)),this.setAttribute("uv",new Zt(a,2)),i===0?this.computeVertexNormals():this.normalizeNormals();function o(v){const M=new L,x=new L,b=new L;for(let S=0;S<e.length;S+=3)f(e[S+0],M),f(e[S+1],x),f(e[S+2],b),l(M,x,b,v)}function l(v,M,x,b){const S=b+1,T=[];for(let y=0;y<=S;y++){T[y]=[];const A=v.clone().lerp(x,y/S),E=M.clone().lerp(x,y/S),P=S-y;for(let D=0;D<=P;D++)D===0&&y===S?T[y][D]=A:T[y][D]=A.clone().lerp(E,D/P)}for(let y=0;y<S;y++)for(let A=0;A<2*(S-y)-1;A++){const E=Math.floor(A/2);A%2===0?(u(T[y][E+1]),u(T[y+1][E]),u(T[y][E])):(u(T[y][E+1]),u(T[y+1][E+1]),u(T[y+1][E]))}}function c(v){const M=new L;for(let x=0;x<s.length;x+=3)M.x=s[x+0],M.y=s[x+1],M.z=s[x+2],M.normalize().multiplyScalar(v),s[x+0]=M.x,s[x+1]=M.y,s[x+2]=M.z}function h(){const v=new L;for(let M=0;M<s.length;M+=3){v.x=s[M+0],v.y=s[M+1],v.z=s[M+2];const x=p(v)/2/Math.PI+.5,b=g(v)/Math.PI+.5;a.push(x,1-b)}m(),d()}function d(){for(let v=0;v<a.length;v+=6){const M=a[v+0],x=a[v+2],b=a[v+4],S=Math.max(M,x,b),T=Math.min(M,x,b);S>.9&&T<.1&&(M<.2&&(a[v+0]+=1),x<.2&&(a[v+2]+=1),b<.2&&(a[v+4]+=1))}}function u(v){s.push(v.x,v.y,v.z)}function f(v,M){const x=v*3;M.x=t[x+0],M.y=t[x+1],M.z=t[x+2]}function m(){const v=new L,M=new L,x=new L,b=new L,S=new ft,T=new ft,y=new ft;for(let A=0,E=0;A<s.length;A+=9,E+=6){v.set(s[A+0],s[A+1],s[A+2]),M.set(s[A+3],s[A+4],s[A+5]),x.set(s[A+6],s[A+7],s[A+8]),S.set(a[E+0],a[E+1]),T.set(a[E+2],a[E+3]),y.set(a[E+4],a[E+5]),b.copy(v).add(M).add(x).divideScalar(3);const P=p(b);_(S,E+0,v,P),_(T,E+2,M,P),_(y,E+4,x,P)}}function _(v,M,x,b){b<0&&v.x===1&&(a[M]=v.x-1),x.x===0&&x.z===0&&(a[M]=b/2/Math.PI+.5)}function p(v){return Math.atan2(v.z,-v.x)}function g(v){return Math.atan2(-v.y,Math.sqrt(v.x*v.x+v.z*v.z))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Mr(t.vertices,t.indices,t.radius,t.detail)}}class Da extends Mr{constructor(t=1,e=0){const n=(1+Math.sqrt(5))/2,i=1/n,s=[-1,-1,-1,-1,-1,1,-1,1,-1,-1,1,1,1,-1,-1,1,-1,1,1,1,-1,1,1,1,0,-i,-n,0,-i,n,0,i,-n,0,i,n,-i,-n,0,-i,n,0,i,-n,0,i,n,0,-n,0,-i,n,0,-i,-n,0,i,n,0,i],a=[3,11,7,3,7,15,3,15,13,7,19,17,7,17,6,7,6,15,17,4,8,17,8,10,17,10,6,8,0,16,8,16,2,8,2,10,0,12,1,0,1,18,0,18,16,6,10,2,6,2,13,6,13,15,2,16,18,2,18,3,2,3,13,18,1,9,18,9,11,18,11,3,4,14,12,4,12,0,4,0,8,11,9,5,11,5,19,11,19,7,19,5,14,19,14,4,19,4,17,1,12,14,1,14,5,1,5,9];super(s,a,t,e),this.type="DodecahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new Da(t.radius,t.detail)}}class Jn{constructor(){this.type="Curve",this.arcLengthDivisions=200,this.needsUpdate=!1,this.cacheArcLengths=null}getPoint(){Nt("Curve: .getPoint() not implemented.")}getPointAt(t,e){const n=this.getUtoTmapping(t);return this.getPoint(n,e)}getPoints(t=5){const e=[];for(let n=0;n<=t;n++)e.push(this.getPoint(n/t));return e}getSpacedPoints(t=5){const e=[];for(let n=0;n<=t;n++)e.push(this.getPointAt(n/t));return e}getLength(){const t=this.getLengths();return t[t.length-1]}getLengths(t=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===t+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;const e=[];let n,i=this.getPoint(0),s=0;e.push(0);for(let a=1;a<=t;a++)n=this.getPoint(a/t),s+=n.distanceTo(i),e.push(s),i=n;return this.cacheArcLengths=e,e}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(t,e=null){const n=this.getLengths();let i=0;const s=n.length;let a;e?a=e:a=t*n[s-1];let o=0,l=s-1,c;for(;o<=l;)if(i=Math.floor(o+(l-o)/2),c=n[i]-a,c<0)o=i+1;else if(c>0)l=i-1;else{l=i;break}if(i=l,n[i]===a)return i/(s-1);const h=n[i],u=n[i+1]-h,f=(a-h)/u;return(i+f)/(s-1)}getTangent(t,e){let i=t-1e-4,s=t+1e-4;i<0&&(i=0),s>1&&(s=1);const a=this.getPoint(i),o=this.getPoint(s),l=e||(a.isVector2?new ft:new L);return l.copy(o).sub(a).normalize(),l}getTangentAt(t,e){const n=this.getUtoTmapping(t);return this.getTangent(n,e)}computeFrenetFrames(t,e=!1){const n=new L,i=[],s=[],a=[],o=new L,l=new It;for(let f=0;f<=t;f++){const m=f/t;i[f]=this.getTangentAt(m,new L)}s[0]=new L,a[0]=new L;let c=Number.MAX_VALUE;const h=Math.abs(i[0].x),d=Math.abs(i[0].y),u=Math.abs(i[0].z);h<=c&&(c=h,n.set(1,0,0)),d<=c&&(c=d,n.set(0,1,0)),u<=c&&n.set(0,0,1),o.crossVectors(i[0],n).normalize(),s[0].crossVectors(i[0],o),a[0].crossVectors(i[0],s[0]);for(let f=1;f<=t;f++){if(s[f]=s[f-1].clone(),a[f]=a[f-1].clone(),o.crossVectors(i[f-1],i[f]),o.length()>Number.EPSILON){o.normalize();const m=Math.acos(qt(i[f-1].dot(i[f]),-1,1));s[f].applyMatrix4(l.makeRotationAxis(o,m))}a[f].crossVectors(i[f],s[f])}if(e===!0){let f=Math.acos(qt(s[0].dot(s[t]),-1,1));f/=t,i[0].dot(o.crossVectors(s[0],s[t]))>0&&(f=-f);for(let m=1;m<=t;m++)s[m].applyMatrix4(l.makeRotationAxis(i[m],f*m)),a[m].crossVectors(i[m],s[m])}return{tangents:i,normals:s,binormals:a}}clone(){return new this.constructor().copy(this)}copy(t){return this.arcLengthDivisions=t.arcLengthDivisions,this}toJSON(){const t={metadata:{version:4.7,type:"Curve",generator:"Curve.toJSON"}};return t.arcLengthDivisions=this.arcLengthDivisions,t.type=this.type,t}fromJSON(t){return this.arcLengthDivisions=t.arcLengthDivisions,this}}class Yl extends Jn{constructor(t=0,e=0,n=1,i=1,s=0,a=Math.PI*2,o=!1,l=0){super(),this.isEllipseCurve=!0,this.type="EllipseCurve",this.aX=t,this.aY=e,this.xRadius=n,this.yRadius=i,this.aStartAngle=s,this.aEndAngle=a,this.aClockwise=o,this.aRotation=l}getPoint(t,e=new ft){const n=e,i=Math.PI*2;let s=this.aEndAngle-this.aStartAngle;const a=Math.abs(s)<Number.EPSILON;for(;s<0;)s+=i;for(;s>i;)s-=i;s<Number.EPSILON&&(a?s=0:s=i),this.aClockwise===!0&&!a&&(s===i?s=-i:s=s-i);const o=this.aStartAngle+t*s;let l=this.aX+this.xRadius*Math.cos(o),c=this.aY+this.yRadius*Math.sin(o);if(this.aRotation!==0){const h=Math.cos(this.aRotation),d=Math.sin(this.aRotation),u=l-this.aX,f=c-this.aY;l=u*h-f*d+this.aX,c=u*d+f*h+this.aY}return n.set(l,c)}copy(t){return super.copy(t),this.aX=t.aX,this.aY=t.aY,this.xRadius=t.xRadius,this.yRadius=t.yRadius,this.aStartAngle=t.aStartAngle,this.aEndAngle=t.aEndAngle,this.aClockwise=t.aClockwise,this.aRotation=t.aRotation,this}toJSON(){const t=super.toJSON();return t.aX=this.aX,t.aY=this.aY,t.xRadius=this.xRadius,t.yRadius=this.yRadius,t.aStartAngle=this.aStartAngle,t.aEndAngle=this.aEndAngle,t.aClockwise=this.aClockwise,t.aRotation=this.aRotation,t}fromJSON(t){return super.fromJSON(t),this.aX=t.aX,this.aY=t.aY,this.xRadius=t.xRadius,this.yRadius=t.yRadius,this.aStartAngle=t.aStartAngle,this.aEndAngle=t.aEndAngle,this.aClockwise=t.aClockwise,this.aRotation=t.aRotation,this}}class Yp extends Yl{constructor(t,e,n,i,s,a){super(t,e,n,n,i,s,a),this.isArcCurve=!0,this.type="ArcCurve"}}function ql(){let r=0,t=0,e=0,n=0;function i(s,a,o,l){r=s,t=o,e=-3*s+3*a-2*o-l,n=2*s-2*a+o+l}return{initCatmullRom:function(s,a,o,l,c){i(a,o,c*(o-s),c*(l-a))},initNonuniformCatmullRom:function(s,a,o,l,c,h,d){let u=(a-s)/c-(o-s)/(c+h)+(o-a)/h,f=(o-a)/h-(l-a)/(h+d)+(l-o)/d;u*=h,f*=h,i(a,o,u,f)},calc:function(s){const a=s*s,o=a*s;return r+t*s+e*a+n*o}}}const fu=new L,du=new L,Zl=new ql,$l=new ql,Kl=new ql;class Ua extends Jn{constructor(t=[],e=!1,n="centripetal",i=.5){super(),this.isCatmullRomCurve3=!0,this.type="CatmullRomCurve3",this.points=t,this.closed=e,this.curveType=n,this.tension=i}getPoint(t,e=new L){const n=e,i=this.points,s=i.length,a=(s-(this.closed?0:1))*t;let o=Math.floor(a),l=a-o;this.closed?o+=o>0?0:(Math.floor(Math.abs(o)/s)+1)*s:l===0&&o===s-1&&(o=s-2,l=1);let c,h;this.closed||o>0?c=i[(o-1)%s]:(du.subVectors(i[0],i[1]).add(i[0]),c=du);const d=i[o%s],u=i[(o+1)%s];if(this.closed||o+2<s?h=i[(o+2)%s]:(fu.subVectors(i[s-1],i[s-2]).add(i[s-1]),h=fu),this.curveType==="centripetal"||this.curveType==="chordal"){const f=this.curveType==="chordal"?.5:.25;let m=Math.pow(c.distanceToSquared(d),f),_=Math.pow(d.distanceToSquared(u),f),p=Math.pow(u.distanceToSquared(h),f);_<1e-4&&(_=1),m<1e-4&&(m=_),p<1e-4&&(p=_),Zl.initNonuniformCatmullRom(c.x,d.x,u.x,h.x,m,_,p),$l.initNonuniformCatmullRom(c.y,d.y,u.y,h.y,m,_,p),Kl.initNonuniformCatmullRom(c.z,d.z,u.z,h.z,m,_,p)}else this.curveType==="catmullrom"&&(Zl.initCatmullRom(c.x,d.x,u.x,h.x,this.tension),$l.initCatmullRom(c.y,d.y,u.y,h.y,this.tension),Kl.initCatmullRom(c.z,d.z,u.z,h.z,this.tension));return n.set(Zl.calc(l),$l.calc(l),Kl.calc(l)),n}copy(t){super.copy(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){const i=t.points[e];this.points.push(i.clone())}return this.closed=t.closed,this.curveType=t.curveType,this.tension=t.tension,this}toJSON(){const t=super.toJSON();t.points=[];for(let e=0,n=this.points.length;e<n;e++){const i=this.points[e];t.points.push(i.toArray())}return t.closed=this.closed,t.curveType=this.curveType,t.tension=this.tension,t}fromJSON(t){super.fromJSON(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){const i=t.points[e];this.points.push(new L().fromArray(i))}return this.closed=t.closed,this.curveType=t.curveType,this.tension=t.tension,this}}function pu(r,t,e,n,i){const s=(n-t)*.5,a=(i-e)*.5,o=r*r,l=r*o;return(2*e-2*n+s+a)*l+(-3*e+3*n-2*s-a)*o+s*r+e}function qp(r,t){const e=1-r;return e*e*t}function Zp(r,t){return 2*(1-r)*r*t}function $p(r,t){return r*r*t}function yr(r,t,e,n){return qp(r,t)+Zp(r,e)+$p(r,n)}function Kp(r,t){const e=1-r;return e*e*e*t}function Jp(r,t){const e=1-r;return 3*e*e*r*t}function jp(r,t){return 3*(1-r)*r*r*t}function Qp(r,t){return r*r*r*t}function Sr(r,t,e,n,i){return Kp(r,t)+Jp(r,e)+jp(r,n)+Qp(r,i)}class mu extends Jn{constructor(t=new ft,e=new ft,n=new ft,i=new ft){super(),this.isCubicBezierCurve=!0,this.type="CubicBezierCurve",this.v0=t,this.v1=e,this.v2=n,this.v3=i}getPoint(t,e=new ft){const n=e,i=this.v0,s=this.v1,a=this.v2,o=this.v3;return n.set(Sr(t,i.x,s.x,a.x,o.x),Sr(t,i.y,s.y,a.y,o.y)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this.v3.copy(t.v3),this}toJSON(){const t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t.v3=this.v3.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this.v3.fromArray(t.v3),this}}class tm extends Jn{constructor(t=new L,e=new L,n=new L,i=new L){super(),this.isCubicBezierCurve3=!0,this.type="CubicBezierCurve3",this.v0=t,this.v1=e,this.v2=n,this.v3=i}getPoint(t,e=new L){const n=e,i=this.v0,s=this.v1,a=this.v2,o=this.v3;return n.set(Sr(t,i.x,s.x,a.x,o.x),Sr(t,i.y,s.y,a.y,o.y),Sr(t,i.z,s.z,a.z,o.z)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this.v3.copy(t.v3),this}toJSON(){const t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t.v3=this.v3.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this.v3.fromArray(t.v3),this}}class gu extends Jn{constructor(t=new ft,e=new ft){super(),this.isLineCurve=!0,this.type="LineCurve",this.v1=t,this.v2=e}getPoint(t,e=new ft){const n=e;return t===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(t).add(this.v1)),n}getPointAt(t,e){return this.getPoint(t,e)}getTangent(t,e=new ft){return e.subVectors(this.v2,this.v1).normalize()}getTangentAt(t,e){return this.getTangent(t,e)}copy(t){return super.copy(t),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){const t=super.toJSON();return t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}}class em extends Jn{constructor(t=new L,e=new L){super(),this.isLineCurve3=!0,this.type="LineCurve3",this.v1=t,this.v2=e}getPoint(t,e=new L){const n=e;return t===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(t).add(this.v1)),n}getPointAt(t,e){return this.getPoint(t,e)}getTangent(t,e=new L){return e.subVectors(this.v2,this.v1).normalize()}getTangentAt(t,e){return this.getTangent(t,e)}copy(t){return super.copy(t),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){const t=super.toJSON();return t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}}class xu extends Jn{constructor(t=new ft,e=new ft,n=new ft){super(),this.isQuadraticBezierCurve=!0,this.type="QuadraticBezierCurve",this.v0=t,this.v1=e,this.v2=n}getPoint(t,e=new ft){const n=e,i=this.v0,s=this.v1,a=this.v2;return n.set(yr(t,i.x,s.x,a.x),yr(t,i.y,s.y,a.y)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){const t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}}class vu extends Jn{constructor(t=new L,e=new L,n=new L){super(),this.isQuadraticBezierCurve3=!0,this.type="QuadraticBezierCurve3",this.v0=t,this.v1=e,this.v2=n}getPoint(t,e=new L){const n=e,i=this.v0,s=this.v1,a=this.v2;return n.set(yr(t,i.x,s.x,a.x),yr(t,i.y,s.y,a.y),yr(t,i.z,s.z,a.z)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){const t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}}class _u extends Jn{constructor(t=[]){super(),this.isSplineCurve=!0,this.type="SplineCurve",this.points=t}getPoint(t,e=new ft){const n=e,i=this.points,s=(i.length-1)*t,a=Math.floor(s),o=s-a,l=i[a===0?a:a-1],c=i[a],h=i[a>i.length-2?i.length-1:a+1],d=i[a>i.length-3?i.length-1:a+2];return n.set(pu(o,l.x,c.x,h.x,d.x),pu(o,l.y,c.y,h.y,d.y)),n}copy(t){super.copy(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){const i=t.points[e];this.points.push(i.clone())}return this}toJSON(){const t=super.toJSON();t.points=[];for(let e=0,n=this.points.length;e<n;e++){const i=this.points[e];t.points.push(i.toArray())}return t}fromJSON(t){super.fromJSON(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){const i=t.points[e];this.points.push(new ft().fromArray(i))}return this}}var Jl=Object.freeze({__proto__:null,ArcCurve:Yp,CatmullRomCurve3:Ua,CubicBezierCurve:mu,CubicBezierCurve3:tm,EllipseCurve:Yl,LineCurve:gu,LineCurve3:em,QuadraticBezierCurve:xu,QuadraticBezierCurve3:vu,SplineCurve:_u});class nm extends Jn{constructor(){super(),this.type="CurvePath",this.curves=[],this.autoClose=!1}add(t){this.curves.push(t)}closePath(){const t=this.curves[0].getPoint(0),e=this.curves[this.curves.length-1].getPoint(1);if(!t.equals(e)){const n=t.isVector2===!0?"LineCurve":"LineCurve3";this.curves.push(new Jl[n](e,t))}return this}getPoint(t,e){const n=t*this.getLength(),i=this.getCurveLengths();let s=0;for(;s<i.length;){if(i[s]>=n){const a=i[s]-n,o=this.curves[s],l=o.getLength(),c=l===0?0:1-a/l;return o.getPointAt(c,e)}s++}return null}getLength(){const t=this.getCurveLengths();return t[t.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;const t=[];let e=0;for(let n=0,i=this.curves.length;n<i;n++)e+=this.curves[n].getLength(),t.push(e);return this.cacheLengths=t,t}getSpacedPoints(t=40){const e=[];for(let n=0;n<=t;n++)e.push(this.getPoint(n/t));return this.autoClose&&e.push(e[0]),e}getPoints(t=12){const e=[];let n;for(let i=0,s=this.curves;i<s.length;i++){const a=s[i],o=a.isEllipseCurve?t*2:a.isLineCurve||a.isLineCurve3?1:a.isSplineCurve?t*a.points.length:t,l=a.getPoints(o);for(let c=0;c<l.length;c++){const h=l[c];n&&n.equals(h)||(e.push(h),n=h)}}return this.autoClose&&e.length>1&&!e[e.length-1].equals(e[0])&&e.push(e[0]),e}copy(t){super.copy(t),this.curves=[];for(let e=0,n=t.curves.length;e<n;e++){const i=t.curves[e];this.curves.push(i.clone())}return this.autoClose=t.autoClose,this}toJSON(){const t=super.toJSON();t.autoClose=this.autoClose,t.curves=[];for(let e=0,n=this.curves.length;e<n;e++){const i=this.curves[e];t.curves.push(i.toJSON())}return t}fromJSON(t){super.fromJSON(t),this.autoClose=t.autoClose,this.curves=[];for(let e=0,n=t.curves.length;e<n;e++){const i=t.curves[e];this.curves.push(new Jl[i.type]().fromJSON(i))}return this}}class Mu extends nm{constructor(t){super(),this.type="Path",this.currentPoint=new ft,t&&this.setFromPoints(t)}setFromPoints(t){this.moveTo(t[0].x,t[0].y);for(let e=1,n=t.length;e<n;e++)this.lineTo(t[e].x,t[e].y);return this}moveTo(t,e){return this.currentPoint.set(t,e),this}lineTo(t,e){const n=new gu(this.currentPoint.clone(),new ft(t,e));return this.curves.push(n),this.currentPoint.set(t,e),this}quadraticCurveTo(t,e,n,i){const s=new xu(this.currentPoint.clone(),new ft(t,e),new ft(n,i));return this.curves.push(s),this.currentPoint.set(n,i),this}bezierCurveTo(t,e,n,i,s,a){const o=new mu(this.currentPoint.clone(),new ft(t,e),new ft(n,i),new ft(s,a));return this.curves.push(o),this.currentPoint.set(s,a),this}splineThru(t){const e=[this.currentPoint.clone()].concat(t),n=new _u(e);return this.curves.push(n),this.currentPoint.copy(t[t.length-1]),this}arc(t,e,n,i,s,a){const o=this.currentPoint.x,l=this.currentPoint.y;return this.absarc(t+o,e+l,n,i,s,a),this}absarc(t,e,n,i,s,a){return this.absellipse(t,e,n,n,i,s,a),this}ellipse(t,e,n,i,s,a,o,l){const c=this.currentPoint.x,h=this.currentPoint.y;return this.absellipse(t+c,e+h,n,i,s,a,o,l),this}absellipse(t,e,n,i,s,a,o,l){const c=new Yl(t,e,n,i,s,a,o,l);if(this.curves.length>0){const d=c.getPoint(0);d.equals(this.currentPoint)||this.lineTo(d.x,d.y)}this.curves.push(c);const h=c.getPoint(1);return this.currentPoint.copy(h),this}copy(t){return super.copy(t),this.currentPoint.copy(t.currentPoint),this}toJSON(){const t=super.toJSON();return t.currentPoint=this.currentPoint.toArray(),t}fromJSON(t){return super.fromJSON(t),this.currentPoint.fromArray(t.currentPoint),this}}class yu extends Mu{constructor(t){super(t),this.uuid=An(),this.type="Shape",this.holes=[]}getPointsHoles(t){const e=[];for(let n=0,i=this.holes.length;n<i;n++)e[n]=this.holes[n].getPoints(t);return e}extractPoints(t){return{shape:this.getPoints(t),holes:this.getPointsHoles(t)}}copy(t){super.copy(t),this.holes=[];for(let e=0,n=t.holes.length;e<n;e++){const i=t.holes[e];this.holes.push(i.clone())}return this}toJSON(){const t=super.toJSON();t.uuid=this.uuid,t.holes=[];for(let e=0,n=this.holes.length;e<n;e++){const i=this.holes[e];t.holes.push(i.toJSON())}return t}fromJSON(t){super.fromJSON(t),this.uuid=t.uuid,this.holes=[];for(let e=0,n=t.holes.length;e<n;e++){const i=t.holes[e];this.holes.push(new Mu().fromJSON(i))}return this}}function im(r,t,e=2){const n=t&&t.length,i=n?t[0]*e:r.length;let s=Su(r,0,i,e,!0);const a=[];if(!s||s.next===s.prev)return a;let o,l,c;if(n&&(s=lm(r,t,s,e)),r.length>80*e){o=r[0],l=r[1];let h=o,d=l;for(let u=e;u<i;u+=e){const f=r[u],m=r[u+1];f<o&&(o=f),m<l&&(l=m),f>h&&(h=f),m>d&&(d=m)}c=Math.max(h-o,d-l),c=c!==0?32767/c:0}return br(s,a,e,o,l,c,0),a}function Su(r,t,e,n,i){let s;if(i===_m(r,t,e,n)>0)for(let a=t;a<e;a+=n)s=Tu(a/n|0,r[a],r[a+1],s);else for(let a=e-n;a>=t;a-=n)s=Tu(a/n|0,r[a],r[a+1],s);return s&&Ss(s,s.next)&&(Tr(s),s=s.next),s}function Gi(r,t){if(!r)return r;t||(t=r);let e=r,n;do if(n=!1,!e.steiner&&(Ss(e,e.next)||Ie(e.prev,e,e.next)===0)){if(Tr(e),e=t=e.prev,e===e.next)break;n=!0}else e=e.next;while(n||e!==t);return t}function br(r,t,e,n,i,s,a){if(!r)return;!a&&s&&dm(r,n,i,s);let o=r;for(;r.prev!==r.next;){const l=r.prev,c=r.next;if(s?rm(r,n,i,s):sm(r)){t.push(l.i,r.i,c.i),Tr(r),r=c.next,o=c.next;continue}if(r=c,r===o){a?a===1?(r=am(Gi(r),t),br(r,t,e,n,i,s,2)):a===2&&om(r,t,e,n,i,s):br(Gi(r),t,e,n,i,s,1);break}}}function sm(r){const t=r.prev,e=r,n=r.next;if(Ie(t,e,n)>=0)return!1;const i=t.x,s=e.x,a=n.x,o=t.y,l=e.y,c=n.y,h=Math.min(i,s,a),d=Math.min(o,l,c),u=Math.max(i,s,a),f=Math.max(o,l,c);let m=n.next;for(;m!==t;){if(m.x>=h&&m.x<=u&&m.y>=d&&m.y<=f&&wr(i,o,s,l,a,c,m.x,m.y)&&Ie(m.prev,m,m.next)>=0)return!1;m=m.next}return!0}function rm(r,t,e,n){const i=r.prev,s=r,a=r.next;if(Ie(i,s,a)>=0)return!1;const o=i.x,l=s.x,c=a.x,h=i.y,d=s.y,u=a.y,f=Math.min(o,l,c),m=Math.min(h,d,u),_=Math.max(o,l,c),p=Math.max(h,d,u),g=jl(f,m,t,e,n),v=jl(_,p,t,e,n);let M=r.prevZ,x=r.nextZ;for(;M&&M.z>=g&&x&&x.z<=v;){if(M.x>=f&&M.x<=_&&M.y>=m&&M.y<=p&&M!==i&&M!==a&&wr(o,h,l,d,c,u,M.x,M.y)&&Ie(M.prev,M,M.next)>=0||(M=M.prevZ,x.x>=f&&x.x<=_&&x.y>=m&&x.y<=p&&x!==i&&x!==a&&wr(o,h,l,d,c,u,x.x,x.y)&&Ie(x.prev,x,x.next)>=0))return!1;x=x.nextZ}for(;M&&M.z>=g;){if(M.x>=f&&M.x<=_&&M.y>=m&&M.y<=p&&M!==i&&M!==a&&wr(o,h,l,d,c,u,M.x,M.y)&&Ie(M.prev,M,M.next)>=0)return!1;M=M.prevZ}for(;x&&x.z<=v;){if(x.x>=f&&x.x<=_&&x.y>=m&&x.y<=p&&x!==i&&x!==a&&wr(o,h,l,d,c,u,x.x,x.y)&&Ie(x.prev,x,x.next)>=0)return!1;x=x.nextZ}return!0}function am(r,t){let e=r;do{const n=e.prev,i=e.next.next;!Ss(n,i)&&wu(n,e,e.next,i)&&Ar(n,i)&&Ar(i,n)&&(t.push(n.i,e.i,i.i),Tr(e),Tr(e.next),e=r=i),e=e.next}while(e!==r);return Gi(e)}function om(r,t,e,n,i,s){let a=r;do{let o=a.next.next;for(;o!==a.prev;){if(a.i!==o.i&&gm(a,o)){let l=Au(a,o);a=Gi(a,a.next),l=Gi(l,l.next),br(a,t,e,n,i,s,0),br(l,t,e,n,i,s,0);return}o=o.next}a=a.next}while(a!==r)}function lm(r,t,e,n){const i=[];for(let s=0,a=t.length;s<a;s++){const o=t[s]*n,l=s<a-1?t[s+1]*n:r.length,c=Su(r,o,l,n,!1);c===c.next&&(c.steiner=!0),i.push(mm(c))}i.sort(cm);for(let s=0;s<i.length;s++)e=hm(i[s],e);return e}function cm(r,t){let e=r.x-t.x;if(e===0&&(e=r.y-t.y,e===0)){const n=(r.next.y-r.y)/(r.next.x-r.x),i=(t.next.y-t.y)/(t.next.x-t.x);e=n-i}return e}function hm(r,t){const e=um(r,t);if(!e)return t;const n=Au(e,r);return Gi(n,n.next),Gi(e,e.next)}function um(r,t){let e=t;const n=r.x,i=r.y;let s=-1/0,a;if(Ss(r,e))return e;do{if(Ss(r,e.next))return e.next;if(i<=e.y&&i>=e.next.y&&e.next.y!==e.y){const d=e.x+(i-e.y)*(e.next.x-e.x)/(e.next.y-e.y);if(d<=n&&d>s&&(s=d,a=e.x<e.next.x?e:e.next,d===n))return a}e=e.next}while(e!==t);if(!a)return null;const o=a,l=a.x,c=a.y;let h=1/0;e=a;do{if(n>=e.x&&e.x>=l&&n!==e.x&&bu(i<c?n:s,i,l,c,i<c?s:n,i,e.x,e.y)){const d=Math.abs(i-e.y)/(n-e.x);Ar(e,r)&&(d<h||d===h&&(e.x>a.x||e.x===a.x&&fm(a,e)))&&(a=e,h=d)}e=e.next}while(e!==o);return a}function fm(r,t){return Ie(r.prev,r,t.prev)<0&&Ie(t.next,r,r.next)<0}function dm(r,t,e,n){let i=r;do i.z===0&&(i.z=jl(i.x,i.y,t,e,n)),i.prevZ=i.prev,i.nextZ=i.next,i=i.next;while(i!==r);i.prevZ.nextZ=null,i.prevZ=null,pm(i)}function pm(r){let t,e=1;do{let n=r,i;r=null;let s=null;for(t=0;n;){t++;let a=n,o=0;for(let c=0;c<e&&(o++,a=a.nextZ,!!a);c++);let l=e;for(;o>0||l>0&&a;)o!==0&&(l===0||!a||n.z<=a.z)?(i=n,n=n.nextZ,o--):(i=a,a=a.nextZ,l--),s?s.nextZ=i:r=i,i.prevZ=s,s=i;n=a}s.nextZ=null,e*=2}while(t>1);return r}function jl(r,t,e,n,i){return r=(r-e)*i|0,t=(t-n)*i|0,r=(r|r<<8)&16711935,r=(r|r<<4)&252645135,r=(r|r<<2)&858993459,r=(r|r<<1)&1431655765,t=(t|t<<8)&16711935,t=(t|t<<4)&252645135,t=(t|t<<2)&858993459,t=(t|t<<1)&1431655765,r|t<<1}function mm(r){let t=r,e=r;do(t.x<e.x||t.x===e.x&&t.y<e.y)&&(e=t),t=t.next;while(t!==r);return e}function bu(r,t,e,n,i,s,a,o){return(i-a)*(t-o)>=(r-a)*(s-o)&&(r-a)*(n-o)>=(e-a)*(t-o)&&(e-a)*(s-o)>=(i-a)*(n-o)}function wr(r,t,e,n,i,s,a,o){return!(r===a&&t===o)&&bu(r,t,e,n,i,s,a,o)}function gm(r,t){return r.next.i!==t.i&&r.prev.i!==t.i&&!xm(r,t)&&(Ar(r,t)&&Ar(t,r)&&vm(r,t)&&(Ie(r.prev,r,t.prev)||Ie(r,t.prev,t))||Ss(r,t)&&Ie(r.prev,r,r.next)>0&&Ie(t.prev,t,t.next)>0)}function Ie(r,t,e){return(t.y-r.y)*(e.x-t.x)-(t.x-r.x)*(e.y-t.y)}function Ss(r,t){return r.x===t.x&&r.y===t.y}function wu(r,t,e,n){const i=Fa(Ie(r,t,e)),s=Fa(Ie(r,t,n)),a=Fa(Ie(e,n,r)),o=Fa(Ie(e,n,t));return!!(i!==s&&a!==o||i===0&&Na(r,e,t)||s===0&&Na(r,n,t)||a===0&&Na(e,r,n)||o===0&&Na(e,t,n))}function Na(r,t,e){return t.x<=Math.max(r.x,e.x)&&t.x>=Math.min(r.x,e.x)&&t.y<=Math.max(r.y,e.y)&&t.y>=Math.min(r.y,e.y)}function Fa(r){return r>0?1:r<0?-1:0}function xm(r,t){let e=r;do{if(e.i!==r.i&&e.next.i!==r.i&&e.i!==t.i&&e.next.i!==t.i&&wu(e,e.next,r,t))return!0;e=e.next}while(e!==r);return!1}function Ar(r,t){return Ie(r.prev,r,r.next)<0?Ie(r,t,r.next)>=0&&Ie(r,r.prev,t)>=0:Ie(r,t,r.prev)<0||Ie(r,r.next,t)<0}function vm(r,t){let e=r,n=!1;const i=(r.x+t.x)/2,s=(r.y+t.y)/2;do e.y>s!=e.next.y>s&&e.next.y!==e.y&&i<(e.next.x-e.x)*(s-e.y)/(e.next.y-e.y)+e.x&&(n=!n),e=e.next;while(e!==r);return n}function Au(r,t){const e=Ql(r.i,r.x,r.y),n=Ql(t.i,t.x,t.y),i=r.next,s=t.prev;return r.next=t,t.prev=r,e.next=i,i.prev=e,n.next=e,e.prev=n,s.next=n,n.prev=s,n}function Tu(r,t,e,n){const i=Ql(r,t,e);return n?(i.next=n.next,i.prev=n,n.next.prev=i,n.next=i):(i.prev=i,i.next=i),i}function Tr(r){r.next.prev=r.prev,r.prev.next=r.next,r.prevZ&&(r.prevZ.nextZ=r.nextZ),r.nextZ&&(r.nextZ.prevZ=r.prevZ)}function Ql(r,t,e){return{i:r,x:t,y:e,prev:null,next:null,z:0,prevZ:null,nextZ:null,steiner:!1}}function _m(r,t,e,n){let i=0;for(let s=t,a=e-n;s<e;s+=n)i+=(r[a]-r[s])*(r[s+1]+r[a+1]),a=s;return i}class Mm{static triangulate(t,e,n=2){return im(t,e,n)}}class Er{static area(t){const e=t.length;let n=0;for(let i=e-1,s=0;s<e;i=s++)n+=t[i].x*t[s].y-t[s].x*t[i].y;return n*.5}static isClockWise(t){return Er.area(t)<0}static triangulateShape(t,e){const n=[],i=[],s=[];Eu(t),Cu(n,t);let a=t.length;e.forEach(Eu);for(let l=0;l<e.length;l++)i.push(a),a+=e[l].length,Cu(n,e[l]);const o=Mm.triangulate(n,i);for(let l=0;l<o.length;l+=3)s.push(o.slice(l,l+3));return s}}function Eu(r){const t=r.length;t>2&&r[t-1].equals(r[0])&&r.pop()}function Cu(r,t){for(let e=0;e<t.length;e++)r.push(t[e].x),r.push(t[e].y)}class Cr extends Mr{constructor(t=1,e=0){const n=(1+Math.sqrt(5))/2,i=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1],s=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(i,s,t,e),this.type="IcosahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new Cr(t.radius,t.detail)}}class tc extends ve{constructor(t=[new ft(0,-.5),new ft(.5,0),new ft(0,.5)],e=12,n=0,i=Math.PI*2){super(),this.type="LatheGeometry",this.parameters={points:t,segments:e,phiStart:n,phiLength:i},e=Math.floor(e),i=qt(i,0,Math.PI*2);const s=[],a=[],o=[],l=[],c=[],h=1/e,d=new L,u=new ft,f=new L,m=new L,_=new L;let p=0,g=0;for(let v=0;v<=t.length-1;v++)switch(v){case 0:p=t[v+1].x-t[v].x,g=t[v+1].y-t[v].y,f.x=g*1,f.y=-p,f.z=g*0,_.copy(f),f.normalize(),l.push(f.x,f.y,f.z);break;case t.length-1:l.push(_.x,_.y,_.z);break;default:p=t[v+1].x-t[v].x,g=t[v+1].y-t[v].y,f.x=g*1,f.y=-p,f.z=g*0,m.copy(f),f.x+=_.x,f.y+=_.y,f.z+=_.z,f.normalize(),l.push(f.x,f.y,f.z),_.copy(m)}for(let v=0;v<=e;v++){const M=n+v*h*i,x=Math.sin(M),b=Math.cos(M);for(let S=0;S<=t.length-1;S++){d.x=t[S].x*x,d.y=t[S].y,d.z=t[S].x*b,a.push(d.x,d.y,d.z),u.x=v/e,u.y=S/(t.length-1),o.push(u.x,u.y);const T=l[3*S+0]*x,y=l[3*S+1],A=l[3*S+0]*b;c.push(T,y,A)}}for(let v=0;v<e;v++)for(let M=0;M<t.length-1;M++){const x=M+v*t.length,b=x,S=x+t.length,T=x+t.length+1,y=x+1;s.push(b,S,y),s.push(T,y,S)}this.setIndex(s),this.setAttribute("position",new Zt(a,3)),this.setAttribute("uv",new Zt(o,2)),this.setAttribute("normal",new Zt(c,3))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new tc(t.points,t.segments,t.phiStart,t.phiLength)}}class ec extends Mr{constructor(t=1,e=0){const n=[1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],i=[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2];super(n,i,t,e),this.type="OctahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new ec(t.radius,t.detail)}}class Vn extends ve{constructor(t=1,e=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:i};const s=t/2,a=e/2,o=Math.floor(n),l=Math.floor(i),c=o+1,h=l+1,d=t/o,u=e/l,f=[],m=[],_=[],p=[];for(let g=0;g<h;g++){const v=g*u-a;for(let M=0;M<c;M++){const x=M*d-s;m.push(x,-v,0),_.push(0,0,1),p.push(M/o),p.push(1-g/l)}}for(let g=0;g<l;g++)for(let v=0;v<o;v++){const M=v+c*g,x=v+c*(g+1),b=v+1+c*(g+1),S=v+1+c*g;f.push(M,x,S),f.push(x,b,S)}this.setIndex(f),this.setAttribute("position",new Zt(m,3)),this.setAttribute("normal",new Zt(_,3)),this.setAttribute("uv",new Zt(p,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Vn(t.width,t.height,t.widthSegments,t.heightSegments)}}class Rr extends ve{constructor(t=.5,e=1,n=32,i=1,s=0,a=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:t,outerRadius:e,thetaSegments:n,phiSegments:i,thetaStart:s,thetaLength:a},n=Math.max(3,n),i=Math.max(1,i);const o=[],l=[],c=[],h=[];let d=t;const u=(e-t)/i,f=new L,m=new ft;for(let _=0;_<=i;_++){for(let p=0;p<=n;p++){const g=s+p/n*a;f.x=d*Math.cos(g),f.y=d*Math.sin(g),l.push(f.x,f.y,f.z),c.push(0,0,1),m.x=(f.x/e+1)/2,m.y=(f.y/e+1)/2,h.push(m.x,m.y)}d+=u}for(let _=0;_<i;_++){const p=_*(n+1);for(let g=0;g<n;g++){const v=g+p,M=v,x=v+n+1,b=v+n+2,S=v+1;o.push(M,x,S),o.push(x,b,S)}}this.setIndex(o),this.setAttribute("position",new Zt(l,3)),this.setAttribute("normal",new Zt(c,3)),this.setAttribute("uv",new Zt(h,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Rr(t.innerRadius,t.outerRadius,t.thetaSegments,t.phiSegments,t.thetaStart,t.thetaLength)}}class nc extends ve{constructor(t=new yu([new ft(0,.5),new ft(-.5,-.5),new ft(.5,-.5)]),e=12){super(),this.type="ShapeGeometry",this.parameters={shapes:t,curveSegments:e};const n=[],i=[],s=[],a=[];let o=0,l=0;if(Array.isArray(t)===!1)c(t);else for(let h=0;h<t.length;h++)c(t[h]),this.addGroup(o,l,h),o+=l,l=0;this.setIndex(n),this.setAttribute("position",new Zt(i,3)),this.setAttribute("normal",new Zt(s,3)),this.setAttribute("uv",new Zt(a,2));function c(h){const d=i.length/3,u=h.extractPoints(e);let f=u.shape;const m=u.holes;Er.isClockWise(f)===!1&&(f=f.reverse());for(let p=0,g=m.length;p<g;p++){const v=m[p];Er.isClockWise(v)===!0&&(m[p]=v.reverse())}const _=Er.triangulateShape(f,m);for(let p=0,g=m.length;p<g;p++){const v=m[p];f=f.concat(v)}for(let p=0,g=f.length;p<g;p++){const v=f[p];i.push(v.x,v.y,0),s.push(0,0,1),a.push(v.x,v.y)}for(let p=0,g=_.length;p<g;p++){const v=_[p],M=v[0]+d,x=v[1]+d,b=v[2]+d;n.push(M,x,b),l+=3}}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}toJSON(){const t=super.toJSON(),e=this.parameters.shapes;return ym(e,t)}static fromJSON(t,e){const n=[];for(let i=0,s=t.shapes.length;i<s;i++){const a=e[t.shapes[i]];n.push(a)}return new nc(n,t.curveSegments)}}function ym(r,t){if(t.shapes=[],Array.isArray(r))for(let e=0,n=r.length;e<n;e++){const i=r[e];t.shapes.push(i.uuid)}else t.shapes.push(r.uuid);return t}class yn extends ve{constructor(t=1,e=32,n=16,i=0,s=Math.PI*2,a=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:i,phiLength:s,thetaStart:a,thetaLength:o},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));const l=Math.min(a+o,Math.PI);let c=0;const h=[],d=new L,u=new L,f=[],m=[],_=[],p=[];for(let g=0;g<=n;g++){const v=[],M=g/n,x=a+M*o,b=t*Math.cos(x),S=Math.sqrt(t*t-b*b);let T=0;g===0&&a===0?T=.5/e:g===n&&l===Math.PI&&(T=-.5/e);for(let y=0;y<=e;y++){const A=y/e,E=i+A*s;d.x=-S*Math.cos(E),d.y=b,d.z=S*Math.sin(E),m.push(d.x,d.y,d.z),u.copy(d).normalize(),_.push(u.x,u.y,u.z),p.push(A+T,1-M),v.push(c++)}h.push(v)}for(let g=0;g<n;g++)for(let v=0;v<e;v++){const M=h[g][v+1],x=h[g][v],b=h[g+1][v],S=h[g+1][v+1];(g!==0||a>0)&&f.push(M,x,S),(g!==n-1||l<Math.PI)&&f.push(x,b,S)}this.setIndex(f),this.setAttribute("position",new Zt(m,3)),this.setAttribute("normal",new Zt(_,3)),this.setAttribute("uv",new Zt(p,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new yn(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}}class Pr extends ve{constructor(t=1,e=.4,n=12,i=48,s=Math.PI*2,a=0,o=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:t,tube:e,radialSegments:n,tubularSegments:i,arc:s,thetaStart:a,thetaLength:o},n=Math.floor(n),i=Math.floor(i);const l=[],c=[],h=[],d=[],u=new L,f=new L,m=new L;for(let _=0;_<=n;_++){const p=a+_/n*o;for(let g=0;g<=i;g++){const v=g/i*s;f.x=(t+e*Math.cos(p))*Math.cos(v),f.y=(t+e*Math.cos(p))*Math.sin(v),f.z=e*Math.sin(p),c.push(f.x,f.y,f.z),u.x=t*Math.cos(v),u.y=t*Math.sin(v),m.subVectors(f,u).normalize(),h.push(m.x,m.y,m.z),d.push(g/i),d.push(_/n)}}for(let _=1;_<=n;_++)for(let p=1;p<=i;p++){const g=(i+1)*_+p-1,v=(i+1)*(_-1)+p-1,M=(i+1)*(_-1)+p,x=(i+1)*_+p;l.push(g,v,x),l.push(v,M,x)}this.setIndex(l),this.setAttribute("position",new Zt(c,3)),this.setAttribute("normal",new Zt(h,3)),this.setAttribute("uv",new Zt(d,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Pr(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc,t.thetaStart,t.thetaLength)}}class ic extends ve{constructor(t=new vu(new L(-1,-1,0),new L(-1,1,0),new L(1,1,0)),e=64,n=1,i=8,s=!1){super(),this.type="TubeGeometry",this.parameters={path:t,tubularSegments:e,radius:n,radialSegments:i,closed:s};const a=t.computeFrenetFrames(e,s);this.tangents=a.tangents,this.normals=a.normals,this.binormals=a.binormals;const o=new L,l=new L,c=new ft;let h=new L;const d=[],u=[],f=[],m=[];_(),this.setIndex(m),this.setAttribute("position",new Zt(d,3)),this.setAttribute("normal",new Zt(u,3)),this.setAttribute("uv",new Zt(f,2));function _(){for(let M=0;M<e;M++)p(M);p(s===!1?e:0),v(),g()}function p(M){h=t.getPointAt(M/e,h);const x=a.normals[M],b=a.binormals[M];for(let S=0;S<=i;S++){const T=S/i*Math.PI*2,y=Math.sin(T),A=-Math.cos(T);l.x=A*x.x+y*b.x,l.y=A*x.y+y*b.y,l.z=A*x.z+y*b.z,l.normalize(),u.push(l.x,l.y,l.z),o.x=h.x+n*l.x,o.y=h.y+n*l.y,o.z=h.z+n*l.z,d.push(o.x,o.y,o.z)}}function g(){for(let M=1;M<=e;M++)for(let x=1;x<=i;x++){const b=(i+1)*(M-1)+(x-1),S=(i+1)*M+(x-1),T=(i+1)*M+x,y=(i+1)*(M-1)+x;m.push(b,S,y),m.push(S,T,y)}}function v(){for(let M=0;M<=e;M++)for(let x=0;x<=i;x++)c.x=M/e,c.y=x/i,f.push(c.x,c.y)}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}toJSON(){const t=super.toJSON();return t.path=this.parameters.path.toJSON(),t}static fromJSON(t){return new ic(new Jl[t.path.type]().fromJSON(t.path),t.tubularSegments,t.radius,t.radialSegments,t.closed)}}function bs(r){const t={};for(const e in r){t[e]={};for(const n in r[e]){const i=r[e][n];if(Ru(i))i.isRenderTargetTexture?(Nt("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=i.clone();else if(Array.isArray(i))if(Ru(i[0])){const s=[];for(let a=0,o=i.length;a<o;a++)s[a]=i[a].clone();t[e][n]=s}else t[e][n]=i.slice();else t[e][n]=i}}return t}function an(r){const t={};for(let e=0;e<r.length;e++){const n=bs(r[e]);for(const i in n)t[i]=n[i]}return t}function Ru(r){return r&&(r.isColor||r.isMatrix3||r.isMatrix4||r.isVector2||r.isVector3||r.isVector4||r.isTexture||r.isQuaternion)}function Sm(r){const t=[];for(let e=0;e<r.length;e++)t.push(r[e].clone());return t}function Pu(r){const t=r.getRenderTarget();return t===null?r.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:Qt.workingColorSpace}const Hn={clone:bs,merge:an};var bm=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,wm=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class le extends Mn{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=bm,this.fragmentShader=wm,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=bs(t.uniforms),this.uniformsGroups=Sm(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this.defaultAttributeValues=Object.assign({},t.defaultAttributeValues),this.index0AttributeName=t.index0AttributeName,this.uniformsNeedUpdate=t.uniformsNeedUpdate,this}toJSON(t){const e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(const i in this.uniforms){const a=this.uniforms[i].value;a&&a.isTexture?e.uniforms[i]={type:"t",value:a.toJSON(t).uuid}:a&&a.isColor?e.uniforms[i]={type:"c",value:a.getHex()}:a&&a.isVector2?e.uniforms[i]={type:"v2",value:a.toArray()}:a&&a.isVector3?e.uniforms[i]={type:"v3",value:a.toArray()}:a&&a.isVector4?e.uniforms[i]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?e.uniforms[i]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?e.uniforms[i]={type:"m4",value:a.toArray()}:e.uniforms[i]={value:a}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;const n={};for(const i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}fromJSON(t,e){if(super.fromJSON(t,e),t.uniforms!==void 0)for(const n in t.uniforms){const i=t.uniforms[n];switch(this.uniforms[n]={},i.type){case"t":this.uniforms[n].value=e[i.value]||null;break;case"c":this.uniforms[n].value=new pt().setHex(i.value);break;case"v2":this.uniforms[n].value=new ft().fromArray(i.value);break;case"v3":this.uniforms[n].value=new L().fromArray(i.value);break;case"v4":this.uniforms[n].value=new ue().fromArray(i.value);break;case"m3":this.uniforms[n].value=new Wt().fromArray(i.value);break;case"m4":this.uniforms[n].value=new It().fromArray(i.value);break;default:this.uniforms[n].value=i.value}}if(t.defines!==void 0&&(this.defines=t.defines),t.vertexShader!==void 0&&(this.vertexShader=t.vertexShader),t.fragmentShader!==void 0&&(this.fragmentShader=t.fragmentShader),t.glslVersion!==void 0&&(this.glslVersion=t.glslVersion),t.extensions!==void 0)for(const n in t.extensions)this.extensions[n]=t.extensions[n];return t.lights!==void 0&&(this.lights=t.lights),t.clipping!==void 0&&(this.clipping=t.clipping),this}}class Iu extends le{constructor(t){super(t),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}}class sc extends Mn{constructor(t){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new pt(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new pt(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=er,this.normalScale=new ft(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Tn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}}class jn extends sc{constructor(t){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new ft(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return qt(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(e){this.ior=(1+.4*e)/(1-.4*e)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new pt(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new pt(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new pt(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._retroreflectivity=0,this._sheen=0,this._transmission=0,this.setValues(t)}get anisotropy(){return this._anisotropy}set anisotropy(t){this._anisotropy>0!=t>0&&this.version++,this._anisotropy=t}get clearcoat(){return this._clearcoat}set clearcoat(t){this._clearcoat>0!=t>0&&this.version++,this._clearcoat=t}get iridescence(){return this._iridescence}set iridescence(t){this._iridescence>0!=t>0&&this.version++,this._iridescence=t}get dispersion(){return this._dispersion}set dispersion(t){this._dispersion>0!=t>0&&this.version++,this._dispersion=t}get retroreflectivity(){return this._retroreflectivity}set retroreflectivity(t){this._retroreflectivity>0!=t>0&&this.version++,this._retroreflectivity=t}get sheen(){return this._sheen}set sheen(t){this._sheen>0!=t>0&&this.version++,this._sheen=t}get transmission(){return this._transmission}set transmission(t){this._transmission>0!=t>0&&this.version++,this._transmission=t}copy(t){return super.copy(t),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=t.anisotropy,this.anisotropyRotation=t.anisotropyRotation,this.anisotropyMap=t.anisotropyMap,this.clearcoat=t.clearcoat,this.clearcoatMap=t.clearcoatMap,this.clearcoatRoughness=t.clearcoatRoughness,this.clearcoatRoughnessMap=t.clearcoatRoughnessMap,this.clearcoatNormalMap=t.clearcoatNormalMap,this.clearcoatNormalScale.copy(t.clearcoatNormalScale),this.dispersion=t.dispersion,this.ior=t.ior,this.iridescence=t.iridescence,this.iridescenceMap=t.iridescenceMap,this.iridescenceIOR=t.iridescenceIOR,this.iridescenceThicknessRange=[...t.iridescenceThicknessRange],this.iridescenceThicknessMap=t.iridescenceThicknessMap,this.retroreflectivity=t.retroreflectivity,this.sheen=t.sheen,this.sheenColor.copy(t.sheenColor),this.sheenColorMap=t.sheenColorMap,this.sheenRoughness=t.sheenRoughness,this.sheenRoughnessMap=t.sheenRoughnessMap,this.transmission=t.transmission,this.transmissionMap=t.transmissionMap,this.thickness=t.thickness,this.thicknessMap=t.thicknessMap,this.attenuationDistance=t.attenuationDistance,this.attenuationColor.copy(t.attenuationColor),this.specularIntensity=t.specularIntensity,this.specularIntensityMap=t.specularIntensityMap,this.specularColor.copy(t.specularColor),this.specularColorMap=t.specularColorMap,this}}class Am extends Mn{constructor(t){super(),this.isMeshNormalMaterial=!0,this.type="MeshNormalMaterial",this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=er,this.normalScale=new ft(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.flatShading=!1,this.setValues(t)}copy(t){return super.copy(t),this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.flatShading=t.flatShading,this}}class ie extends Mn{constructor(t){super(),this.isMeshLambertMaterial=!0,this.type="MeshLambertMaterial",this.color=new pt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new pt(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=er,this.normalScale=new ft(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Tn,this.combine=_o,this.reflectivity=1,this.envMapIntensity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.envMapIntensity=t.envMapIntensity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}}class Tm extends Mn{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=kd,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}}class Em extends Mn{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}}function Ci(r,t){return!r||r.constructor===t?r:typeof t.BYTES_PER_ELEMENT=="number"?new t(r):Array.prototype.slice.call(r)}function za(r){return r!==void 0&&r.inTangents!==void 0&&r.outTangents!==void 0}function Cm(r){function t(i,s){return r[i]-r[s]}const e=r.length,n=new Array(e);for(let i=0;i!==e;++i)n[i]=i;return n.sort(t),n}function Lu(r,t,e){const n=r.length,i=new r.constructor(n);for(let s=0,a=0;a!==n;++s){const o=e[s]*t;for(let l=0;l!==t;++l)i[a++]=r[o+l]}return i}function Rm(r,t,e,n){let i=1,s=r[0];for(;s!==void 0&&s[n]===void 0;)s=r[i++];if(s===void 0)return;let a=s[n];if(a!==void 0)if(Array.isArray(a))do a=s[n],a!==void 0&&(t.push(s.time),e.push(...a)),s=r[i++];while(s!==void 0);else if(a.toArray!==void 0)do a=s[n],a!==void 0&&(t.push(s.time),a.toArray(e,e.length)),s=r[i++];while(s!==void 0);else do a=s[n],a!==void 0&&(t.push(s.time),e.push(a)),s=r[i++];while(s!==void 0)}class ws{constructor(t,e,n,i){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){const e=this.parameterPositions;let n=this._cachedIndex,i=e[n],s=e[n-1];n:{t:{let a;e:{i:if(!(t<i)){for(let o=n+2;;){if(i===void 0){if(t<s)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(s=i,i=e[++n],t<i)break t}a=e.length;break e}if(!(t>=s)){const o=e[1];t<o&&(n=2,s=o);for(let l=n-2;;){if(s===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(i=s,s=e[--n-1],t>=s)break t}a=n,n=0;break e}break n}for(;n<a;){const o=n+a>>>1;t<e[o]?a=o:n=o+1}if(i=e[n],s=e[n-1],s===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,s,i)}return this.interpolate_(n,s,t,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){const e=this.resultBuffer,n=this.sampleValues,i=this.valueSize,s=t*i;for(let a=0;a!==i;++a)e[a]=n[s+a];return e}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}}class Pm extends ws{constructor(t,e,n,i){super(t,e,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:mh,endingEnd:mh}}intervalChanged_(t,e,n){const i=this.parameterPositions;let s=t-2,a=t+1,o=i[s],l=i[a];if(o===void 0)switch(this.getSettings_().endingStart){case gh:s=t,o=2*e-n;break;case xh:s=i.length-2,o=e+i[s]-i[s+1];break;default:s=t,o=n}if(l===void 0)switch(this.getSettings_().endingEnd){case gh:a=t,l=2*n-e;break;case xh:a=1,l=n+i[1]-i[0];break;default:a=t-1,l=e}const c=(n-e)*.5,h=this.valueSize;this._weightPrev=c/(e-o),this._weightNext=c/(l-n),this._offsetPrev=s*h,this._offsetNext=a*h}interpolate_(t,e,n,i){const s=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,h=this._offsetPrev,d=this._offsetNext,u=this._weightPrev,f=this._weightNext,m=(n-e)/(i-e),_=m*m,p=_*m,g=-u*p+2*u*_-u*m,v=(1+u)*p+(-1.5-2*u)*_+(-.5+u)*m+1,M=(-1-f)*p+(1.5+f)*_+.5*m,x=f*p-f*_;for(let b=0;b!==o;++b)s[b]=g*a[h+b]+v*a[c+b]+M*a[l+b]+x*a[d+b];return s}}class Im extends ws{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){const s=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,h=(n-e)/(i-e),d=1-h;for(let u=0;u!==o;++u)s[u]=a[c+u]*d+a[l+u]*h;return s}}class Lm extends ws{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t){return this.copySampleValue_(t-1)}}class Dm extends ws{interpolate_(t,e,n,i){const s=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,h=this.inTangents,d=this.outTangents;if(!h||!d){const m=(n-e)/(i-e),_=1-m;for(let p=0;p!==o;++p)s[p]=a[c+p]*_+a[l+p]*m;return s}const u=o*2,f=t-1;for(let m=0;m!==o;++m){const _=a[c+m],p=a[l+m],g=f*u+m*2,v=d[g],M=d[g+1],x=t*u+m*2,b=h[x],S=h[x+1],T=Nm(n,e,v,b,i);s[m]=Du(T,_,M,S,p)}return s}}function Du(r,t,e,n,i){const s=1-r;return s*s*s*t+3*s*s*r*e+3*s*r*r*n+r*r*r*i}function Um(r,t,e,n,i){const s=1-r;return 3*s*s*(e-t)+6*s*r*(n-e)+3*r*r*(i-n)}function Nm(r,t,e,n,i){let s=(r-t)/(i-t);for(let a=0;a<8;a++){const o=Du(s,t,e,n,i)-r;if(Math.abs(o)<1e-10)break;const l=Um(s,t,e,n,i);if(Math.abs(l)<1e-10)break;s=Math.max(0,Math.min(1,s-o/l))}return s}class Gn{constructor(t,e,n,i){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=Ci(e,this.TimeBufferType),this.values=Ci(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(t){const e=t.constructor;let n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:Ci(t.times,Array),values:Ci(t.values,Array)};const i=t.getInterpolation();i!==t.DefaultInterpolation&&(n.interpolation=i),za(t.settings)&&(n.settings={inTangents:Ci(t.settings.inTangents,Array),outTangents:Ci(t.settings.outTangents,Array)})}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new Lm(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new Im(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new Pm(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodBezier(t){const e=new Dm(this.times,this.values,this.getValueSize(),t);return this.settings&&(e.inTangents=this.settings.inTangents,e.outTangents=this.settings.outTangents),e}setInterpolation(t){let e;switch(t){case Qs:e=this.InterpolantFactoryMethodDiscrete;break;case tr:e=this.InterpolantFactoryMethodLinear;break;case cl:e=this.InterpolantFactoryMethodSmooth;break;case ph:e=this.InterpolantFactoryMethodBezier;break}if(e===void 0){const n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return Nt("KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Qs;case this.InterpolantFactoryMethodLinear:return tr;case this.InterpolantFactoryMethodSmooth:return cl;case this.InterpolantFactoryMethodBezier:return ph}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){const e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]+=t}return this}scale(t){if(t!==1){const e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]*=t;za(this.settings)&&(Uu(this.settings.inTangents,t),Uu(this.settings.outTangents,t))}return this}trim(t,e){const n=this.times,i=n.length;let s=0,a=i-1;for(;s!==i&&n[s]<t;)++s;for(;a!==-1&&n[a]>e;)--a;if(++a,s!==0||a!==i){s>=a&&(a=Math.max(a,1),s=a-1);const o=this.getValueSize();this.times=n.slice(s,a),this.values=this.values.slice(s*o,a*o)}return this}validate(){let t=!0;const e=this.getValueSize();e-Math.floor(e)!==0&&(Ot("KeyframeTrack: Invalid value size in track.",this),t=!1);const n=this.times,i=this.values,s=n.length;s===0&&(Ot("KeyframeTrack: Track is empty.",this),t=!1);let a=null;for(let o=0;o!==s;o++){const l=n[o];if(typeof l=="number"&&isNaN(l)){Ot("KeyframeTrack: Time is not a valid number.",this,o,l),t=!1;break}if(a!==null&&a>l){Ot("KeyframeTrack: Out of order keys.",this,o,l,a),t=!1;break}a=l}if(i!==void 0&&Kd(i))for(let o=0,l=i.length;o!==l;++o){const c=i[o];if(isNaN(c)){Ot("KeyframeTrack: Value is not a valid number.",this,o,c),t=!1;break}}return t}optimize(){const t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===cl,s=t.length-1;let a=1;for(let o=1;o<s;++o){let l=!1;const c=t[o],h=t[o+1];if(c!==h&&(o!==1||c!==t[0]))if(i)l=!0;else{const d=o*n,u=d-n,f=d+n;for(let m=0;m!==n;++m){const _=e[d+m];if(_!==e[u+m]||_!==e[f+m]){l=!0;break}}}if(l){if(o!==a){t[a]=t[o];const d=o*n,u=a*n;for(let f=0;f!==n;++f)e[u+f]=e[d+f]}++a}}if(s>0){t[a]=t[s];for(let o=s*n,l=a*n,c=0;c!==n;++c)e[l+c]=e[o+c];++a}return a!==t.length?(this.times=t.slice(0,a),this.values=e.slice(0,a*n)):(this.times=t,this.values=e),this}clone(){const t=this.times.slice(),e=this.values.slice(),n=this.constructor,i=new n(this.name,t,e);return i.createInterpolant=this.createInterpolant,za(this.settings)&&(i.settings={inTangents:this.settings.inTangents.slice(),outTangents:this.settings.outTangents.slice()}),i}}function Uu(r,t){for(let e=0,n=r.length;e!==n;e+=2)r[e]*=t}Gn.prototype.ValueTypeName="",Gn.prototype.TimeBufferType=Float32Array,Gn.prototype.ValueBufferType=Float32Array,Gn.prototype.DefaultInterpolation=tr;class As extends Gn{constructor(t,e,n){super(t,e,n)}}As.prototype.ValueTypeName="bool",As.prototype.ValueBufferType=Array,As.prototype.DefaultInterpolation=Qs,As.prototype.InterpolantFactoryMethodLinear=void 0,As.prototype.InterpolantFactoryMethodSmooth=void 0;class Nu extends Gn{constructor(t,e,n,i){super(t,e,n,i)}}Nu.prototype.ValueTypeName="color";class Ir extends Gn{constructor(t,e,n,i){super(t,e,n,i)}}Ir.prototype.ValueTypeName="number";class Fm extends ws{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){const s=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=(n-e)/(i-e);let c=t*o;for(let h=c+o;c!==h;c+=4)He.slerpFlat(s,0,a,c-o,a,c,l);return s}}class Lr extends Gn{constructor(t,e,n,i){super(t,e,n,i)}InterpolantFactoryMethodLinear(t){return new Fm(this.times,this.values,this.getValueSize(),t)}}Lr.prototype.ValueTypeName="quaternion",Lr.prototype.InterpolantFactoryMethodSmooth=void 0;class Ts extends Gn{constructor(t,e,n){super(t,e,n)}}Ts.prototype.ValueTypeName="string",Ts.prototype.ValueBufferType=Array,Ts.prototype.DefaultInterpolation=Qs,Ts.prototype.InterpolantFactoryMethodLinear=void 0,Ts.prototype.InterpolantFactoryMethodSmooth=void 0;class Oa extends Gn{constructor(t,e,n,i){super(t,e,n,i)}}Oa.prototype.ValueTypeName="vector";class zm{constructor(t="",e=-1,n=[],i=Od){this.name=t,this.tracks=n,this.duration=e,this.blendMode=i,this.uuid=An(),this.userData={},this.duration<0&&this.resetDuration()}static parse(t){const e=[],n=t.tracks,i=1/(t.fps||1);for(let a=0,o=n.length;a!==o;++a)e.push(Bm(n[a]).scale(i));const s=new this(t.name,t.duration,e,t.blendMode);return s.uuid=t.uuid,s.userData=JSON.parse(t.userData||"{}"),s}static toJSON(t){const e=[],n=t.tracks,i={name:t.name,duration:t.duration,tracks:e,uuid:t.uuid,blendMode:t.blendMode,userData:JSON.stringify(t.userData)};for(let s=0,a=n.length;s!==a;++s)e.push(Gn.toJSON(n[s]));return i}static CreateFromMorphTargetSequence(t,e,n,i){const s=e.length,a=[];for(let o=0;o<s;o++){let l=[],c=[];l.push((o+s-1)%s,o,(o+1)%s),c.push(0,1,0);const h=Cm(l);l=Lu(l,1,h),c=Lu(c,1,h),!i&&l[0]===0&&(l.push(s),c.push(c[0])),a.push(new Ir(".morphTargetInfluences["+e[o].name+"]",l,c).scale(1/n))}return new this(t,-1,a)}static findByName(t,e){let n=t;if(!Array.isArray(t)){const i=t;n=i.geometry&&i.geometry.animations||i.animations}for(let i=0;i<n.length;i++)if(n[i].name===e)return n[i];return null}static CreateClipsFromMorphTargetSequences(t,e,n){const i={},s=/^([\w-]*?)([\d]+)$/;for(let o=0,l=t.length;o<l;o++){const c=t[o],h=c.name.match(s);if(h&&h.length>1){const d=h[1];let u=i[d];u||(i[d]=u=[]),u.push(c)}}const a=[];for(const o in i)a.push(this.CreateFromMorphTargetSequence(o,i[o],e,n));return a}resetDuration(){const t=this.tracks;let e=0;for(let n=0,i=t.length;n!==i;++n){const s=this.tracks[n];e=Math.max(e,s.times[s.times.length-1])}return this.duration=e,this}trim(){for(let t=0;t<this.tracks.length;t++)this.tracks[t].trim(0,this.duration);return this}validate(){let t=!0;for(let e=0;e<this.tracks.length;e++)t=t&&this.tracks[e].validate();return t}optimize(){for(let t=0;t<this.tracks.length;t++)this.tracks[t].optimize();return this}clone(){const t=[];for(let n=0;n<this.tracks.length;n++)t.push(this.tracks[n].clone());const e=new this.constructor(this.name,this.duration,t,this.blendMode);return e.userData=JSON.parse(JSON.stringify(this.userData)),e}toJSON(){return this.constructor.toJSON(this)}}function Om(r){switch(r.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return Ir;case"vector":case"vector2":case"vector3":case"vector4":return Oa;case"color":return Nu;case"quaternion":return Lr;case"bool":case"boolean":return As;case"string":return Ts}throw new Error("THREE.KeyframeTrack: Unsupported typeName: "+r)}function Bm(r){if(r.type===void 0)throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");const t=Om(r.type);if(r.times===void 0){const n=[],i=[];Rm(r.keys,n,i,"value"),r.times=n,r.values=i}let e;return t.parse!==void 0?e=t.parse(r):e=new t(r.name,r.times,r.values,r.interpolation),za(r.settings)&&(e.settings={inTangents:Ci(r.settings.inTangents,Float32Array),outTangents:Ci(r.settings.outTangents,Float32Array)}),e}const xi={enabled:!1,files:{},add:function(r,t){this.enabled!==!1&&(Fu(r)||(this.files[r]=t))},get:function(r){if(this.enabled!==!1&&!Fu(r))return this.files[r]},remove:function(r){delete this.files[r]},clear:function(){this.files={}}};function Fu(r){try{const t=r.slice(r.indexOf(":")+1);return new URL(t).protocol==="blob:"}catch{return!1}}class km{constructor(t,e,n){const i=this;let s=!1,a=0,o=0,l;const c=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this._abortController=null,this.itemStart=function(h){o++,s===!1&&i.onStart!==void 0&&i.onStart(h,a,o),s=!0},this.itemEnd=function(h){a++,i.onProgress!==void 0&&i.onProgress(h,a,o),a===o&&(s=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(h){i.onError!==void 0&&i.onError(h)},this.resolveURL=function(h){return h=h.normalize("NFC"),l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,d){return c.push(h,d),this},this.removeHandler=function(h){const d=c.indexOf(h);return d!==-1&&c.splice(d,2),this},this.getHandler=function(h){for(let d=0,u=c.length;d<u;d+=2){const f=c[d],m=c[d+1];if(f.global&&(f.lastIndex=0),f.test(h))return m}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}}const Vm=new km;class Es{constructor(t){this.manager=t!==void 0?t:Vm,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(t,e){const n=this;return new Promise(function(i,s){n.load(t,i,e,s)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}abort(){return this}}Es.DEFAULT_MATERIAL_NAME="__DEFAULT";const vi={};class Hm extends Error{constructor(t,e){super(t),this.response=e}}class zu extends Es{constructor(t){super(t),this.mimeType="",this.responseType="",this._abortController=new AbortController}load(t,e,n,i){t===void 0&&(t=""),this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);const s=xi.get(`file:${t}`);if(s!==void 0){this.manager.itemStart(t),setTimeout(()=>{e&&e(s),this.manager.itemEnd(t)},0);return}if(vi[t]!==void 0){vi[t].push({onLoad:e,onProgress:n,onError:i});return}vi[t]=[],vi[t].push({onLoad:e,onProgress:n,onError:i});const a=new Request(t,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin",signal:typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal}),o=this.mimeType,l=this.responseType;fetch(a).then(c=>{if(c.status===200||c.status===0){if(c.status===0&&Nt("FileLoader: HTTP Status 0 received."),typeof ReadableStream>"u"||c.body===void 0||c.body.getReader===void 0)return c;const h=vi[t],d=c.body.getReader(),u=c.headers.get("X-File-Size")||c.headers.get("Content-Length"),f=u?parseInt(u):0,m=f!==0;let _=0;const p=new ReadableStream({start(g){v();function v(){d.read().then(({done:M,value:x})=>{if(M)g.close();else{_+=x.byteLength;const b=new ProgressEvent("progress",{lengthComputable:m,loaded:_,total:f});for(let S=0,T=h.length;S<T;S++){const y=h[S];y.onProgress&&y.onProgress(b)}g.enqueue(x),v()}},M=>{g.error(M)})}}});return new Response(p)}else throw new Hm(`fetch for "${c.url}" responded with ${c.status}: ${c.statusText}`,c)}).then(c=>{switch(l){case"arraybuffer":return c.arrayBuffer();case"blob":return c.blob();case"document":return c.text().then(h=>new DOMParser().parseFromString(h,o));case"json":return c.json();default:if(o==="")return c.text();{const d=/charset="?([^;"\s]*)"?/i.exec(o),u=d&&d[1]?d[1].toLowerCase():void 0,f=new TextDecoder(u);return c.arrayBuffer().then(m=>f.decode(m))}}}).then(c=>{xi.add(`file:${t}`,c);const h=vi[t];delete vi[t];for(let d=0,u=h.length;d<u;d++){const f=h[d];f.onLoad&&f.onLoad(c)}}).catch(c=>{const h=vi[t];if(h===void 0)throw this.manager.itemError(t),c;delete vi[t];for(let d=0,u=h.length;d<u;d++){const f=h[d];f.onError&&f.onError(c)}this.manager.itemError(t)}).finally(()=>{this.manager.itemEnd(t)}),this.manager.itemStart(t)}setResponseType(t){return this.responseType=t,this}setMimeType(t){return this.mimeType=t,this}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}}const Cs=new WeakMap;class Gm extends Es{constructor(t){super(t)}load(t,e,n,i){this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);const s=this,a=xi.get(`image:${t}`);if(a!==void 0){if(a.complete===!0)s.manager.itemStart(t),setTimeout(function(){e&&e(a),s.manager.itemEnd(t)},0);else{let d=Cs.get(a);d===void 0&&(d=[],Cs.set(a,d)),d.push({onLoad:e,onError:i})}return a}const o=ir("img");function l(){h(),e&&e(this);const d=Cs.get(this)||[];for(let u=0;u<d.length;u++){const f=d[u];f.onLoad&&f.onLoad(this)}Cs.delete(this),s.manager.itemEnd(t)}function c(d){h(),i&&i(d),xi.remove(`image:${t}`);const u=Cs.get(this)||[];for(let f=0;f<u.length;f++){const m=u[f];m.onError&&m.onError(d)}Cs.delete(this),s.manager.itemError(t),s.manager.itemEnd(t)}function h(){o.removeEventListener("load",l,!1),o.removeEventListener("error",c,!1)}return o.addEventListener("load",l,!1),o.addEventListener("error",c,!1),t.slice(0,5)!=="data:"&&this.crossOrigin!==void 0&&(o.crossOrigin=this.crossOrigin),xi.add(`image:${t}`,o),s.manager.itemStart(t),o.src=t,o}}class Ou extends Es{constructor(t){super(t)}load(t,e,n,i){const s=new Re,a=new Gm(this.manager);return a.setCrossOrigin(this.crossOrigin),a.setPath(this.path),a.load(t,function(o){s.image=o,s.needsUpdate=!0,e!==void 0&&e(s)},n,i),s}}class Ba extends Ae{constructor(t,e=1){super(),this.isLight=!0,this.type="Light",this.color=new pt(t),this.intensity=e}copy(t,e){return super.copy(t,e),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){const e=super.toJSON(t);return e.object.color=this.color.getHex(),e.object.intensity=this.intensity,e}}class Wm extends Ba{constructor(t,e,n){super(t,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(Ae.DEFAULT_UP),this.updateMatrix(),this.groundColor=new pt(e)}copy(t,e){return super.copy(t,e),this.groundColor.copy(t.groundColor),this}toJSON(t){const e=super.toJSON(t);return e.object.groundColor=this.groundColor.getHex(),e}}const rc=new It,Bu=new L,ku=new L;class ac{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new ft(512,512),this.mapType=sn,this.map=null,this.mapPass=null,this.matrix=new It,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Vl,this._frameExtents=new ft(1,1),this._viewportCount=1,this._viewports=[new ue(0,0,1,1)]}getViewportCount(){return this._viewportCount}getCamera(){return this.camera}getFrustum(){return this._frustum}updateMatrices(t){const e=this.camera;Bu.setFromMatrixPosition(t.matrixWorld),e.position.copy(Bu),ku.setFromMatrixPosition(t.target.matrixWorld),e.lookAt(ku),e.updateMatrixWorld(),this._updateMatrix(e,this.matrix,this._frustum)}_updateMatrix(t,e,n,i){rc.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),n.setFromProjectionMatrix(rc,t.coordinateSystem,t.reversedDepth);const s=this._frameExtents,a=i?i.z/s.x:1,o=i?i.w/s.y:1,l=i?i.x/s.x:0,c=i?i.y/s.y:0;t.coordinateSystem===nr||t.reversedDepth?e.set(.5*a,0,0,.5*a+l,0,.5*o,0,.5*o+c,0,0,1,0,0,0,0,1):e.set(.5*a,0,0,.5*a+l,0,.5*o,0,.5*o+c,0,0,.5,.5,0,0,0,1),e.multiply(rc)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.autoUpdate=t.autoUpdate,this.needsUpdate=t.needsUpdate,this.normalBias=t.normalBias,this.blurSamples=t.blurSamples,this.mapSize.copy(t.mapSize),this.biasNode=t.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){const t={};return t.intensity=this.intensity,t.bias=this.bias,t.normalBias=this.normalBias,t.radius=this.radius,t.blurSamples=this.blurSamples,t.mapSize=this.mapSize.toArray(),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}}const ka=new L,Va=new He,Qn=new L;class Vu extends Ae{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new It,this.projectionMatrix=new It,this.projectionMatrixInverse=new It,this.coordinateSystem=Zn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorld.decompose(ka,Va,Qn),Qn.x===1&&Qn.y===1&&Qn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(ka,Va,Qn.set(1,1,1)).invert()}updateWorldMatrix(t,e,n=!1){super.updateWorldMatrix(t,e,n),this.matrixWorld.decompose(ka,Va,Qn),Qn.x===1&&Qn.y===1&&Qn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(ka,Va,Qn.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}}const Ri=new L,Hu=new ft,Gu=new ft;class on extends Vu{constructor(t=50,e=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){const e=.5*this.getFilmHeight()/t;this.fov=ns*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){const t=Math.tan(sr*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return ns*2*Math.atan(Math.tan(sr*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){Ri.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(Ri.x,Ri.y).multiplyScalar(-t/Ri.z),Ri.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Ri.x,Ri.y).multiplyScalar(-t/Ri.z)}getViewSize(t,e){return this.getViewBounds(t,Hu,Gu),e.subVectors(Gu,Hu)}setViewOffset(t,e,n,i,s,a){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=s,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const t=this.near;let e=t*Math.tan(sr*.5*this.fov)/this.zoom,n=2*e,i=this.aspect*n,s=-.5*i;const a=this.view;if(this.view!==null&&this.view.enabled){const l=a.fullWidth,c=a.fullHeight;s+=a.offsetX*i/l,e-=a.offsetY*n/c,i*=a.width/l,n*=a.height/c}const o=this.filmOffset;o!==0&&(s+=t*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(s,s+i,e,e-n,t,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){const e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}}class Xm extends ac{constructor(){super(new on(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(t){const e=this.camera,n=ns*2*t.angle*this.focus,i=this.mapSize.width/this.mapSize.height*this.aspect,s=t.distance||e.far;(n!==e.fov||i!==e.aspect||s!==e.far)&&(e.fov=n,e.aspect=i,e.far=s,e.updateProjectionMatrix()),super.updateMatrices(t)}copy(t){return super.copy(t),this.focus=t.focus,this.aspect=t.aspect,this}toJSON(){const t=super.toJSON();return t.focus=this.focus,t.aspect=this.aspect,t}}class Ym extends Ba{constructor(t,e,n=0,i=Math.PI/3,s=0,a=2){super(t,e),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(Ae.DEFAULT_UP),this.updateMatrix(),this.target=new Ae,this.distance=n,this.angle=i,this.penumbra=s,this.decay=a,this.map=null,this.shadow=new Xm}get power(){return this.intensity*Math.PI}set power(t){this.intensity=t/Math.PI}dispose(){super.dispose(),this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.angle=t.angle,this.penumbra=t.penumbra,this.decay=t.decay,this.target=t.target.clone(),this.map=t.map,this.shadow=t.shadow.clone(),this}toJSON(t){const e=super.toJSON(t);return e.object.distance=this.distance,e.object.angle=this.angle,e.object.decay=this.decay,e.object.penumbra=this.penumbra,e.object.target=this.target.uuid,this.map&&this.map.isTexture&&(e.object.map=this.map.toJSON(t).uuid),e.object.shadow=this.shadow.toJSON(),e}}class qm extends ac{constructor(){super(new on(90,1,.5,500)),this.isPointLightShadow=!0}}class Zm extends Ba{constructor(t,e,n=0,i=2){super(t,e),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new qm}get power(){return this.intensity*4*Math.PI}set power(t){this.intensity=t/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.decay=t.decay,this.shadow=t.shadow.clone(),this}toJSON(t){const e=super.toJSON(t);return e.object.distance=this.distance,e.object.decay=this.decay,e.object.shadow=this.shadow.toJSON(),e}}class Dr extends Vu{constructor(t=-1,e=1,n=1,i=-1,s=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=i,this.near=s,this.far=a,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,i,s,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=s,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2;let s=n-t,a=n+t,o=i+e,l=i-e;if(this.view!==null&&this.view.enabled){const c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;s+=c*this.view.offsetX,a=s+c*this.view.width,o-=h*this.view.offsetY,l=o-h*this.view.height}this.projectionMatrix.makeOrthographic(s,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){const e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}}class $m extends ac{constructor(){super(new Dr(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class Ha extends Ba{constructor(t,e){super(t,e),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(Ae.DEFAULT_UP),this.updateMatrix(),this.target=new Ae,this.shadow=new $m}dispose(){super.dispose(),this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}toJSON(t){const e=super.toJSON(t);return e.object.shadow=this.shadow.toJSON(),e.object.target=this.target.uuid,e}}class Ur{static extractUrlBase(t){const e=t.lastIndexOf("/");return e===-1?"./":t.slice(0,e+1)}static resolveURL(t,e){return typeof t!="string"||t===""?"":(/^https?:\/\//i.test(e)&&/^\//.test(t)&&(e=e.replace(/(^https?:\/\/[^\/]+).*/i,"$1")),/^(https?:)?\/\//i.test(t)||/^data:.*,.*$/i.test(t)||/^blob:.*$/i.test(t)?t:e+t)}}const oc=new WeakMap;class Wu extends Es{constructor(t){super(t),this.isImageBitmapLoader=!0,typeof createImageBitmap>"u"&&Nt("ImageBitmapLoader: createImageBitmap() not supported."),typeof fetch>"u"&&Nt("ImageBitmapLoader: fetch() not supported."),this.options={premultiplyAlpha:"none"},this._abortController=new AbortController}setOptions(t){return this.options=t,this}load(t,e,n,i){t===void 0&&(t=""),this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);const s=this,a=xi.get(`image-bitmap:${t}`);if(a!==void 0){if(s.manager.itemStart(t),a.then){a.then(c=>{oc.has(a)===!0?(i&&i(oc.get(a)),s.manager.itemError(t),s.manager.itemEnd(t)):(e&&e(c),s.manager.itemEnd(t))});return}setTimeout(function(){e&&e(a),s.manager.itemEnd(t)},0);return}const o={};o.credentials=this.crossOrigin==="anonymous"?"same-origin":"include",o.headers=this.requestHeader,o.signal=typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal;const l=fetch(t,o).then(function(c){return c.blob()}).then(function(c){return createImageBitmap(c,Object.assign({},s.options,{colorSpaceConversion:"none"}))}).then(function(c){return xi.add(`image-bitmap:${t}`,c),e&&e(c),s.manager.itemEnd(t),c}).catch(function(c){i&&i(c),oc.set(l,c),xi.remove(`image-bitmap:${t}`),s.manager.itemError(t),s.manager.itemEnd(t)});xi.add(`image-bitmap:${t}`,l),s.manager.itemStart(t)}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}}const Rs=-90,Ps=1;class Km extends Ae{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const i=new on(Rs,Ps,t,e);i.layers=this.layers,this.add(i);const s=new on(Rs,Ps,t,e);s.layers=this.layers,this.add(s);const a=new on(Rs,Ps,t,e);a.layers=this.layers,this.add(a);const o=new on(Rs,Ps,t,e);o.layers=this.layers,this.add(o);const l=new on(Rs,Ps,t,e);l.layers=this.layers,this.add(l);const c=new on(Rs,Ps,t,e);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){const t=this.coordinateSystem,e=this.children.concat(),[n,i,s,a,o,l]=e;for(const c of e)this.remove(c);if(t===Zn)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),s.up.set(0,0,-1),s.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===nr)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),s.up.set(0,0,1),s.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(const c of e)this.add(c),c.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());const[s,a,o,l,c,h]=this.children,d=t.getRenderTarget(),u=t.getActiveCubeFace(),f=t.getActiveMipmapLevel(),m=t.xr.enabled;t.xr.enabled=!1;const _=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let p=!1;t.isWebGLRenderer===!0?p=t.state.buffers.depth.getReversed():p=t.reversedDepthBuffer,t.setRenderTarget(n,0,i),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,s),t.setRenderTarget(n,1,i),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,a),t.setRenderTarget(n,2,i),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,o),t.setRenderTarget(n,3,i),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,l),t.setRenderTarget(n,4,i),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,c),n.texture.generateMipmaps=_,t.setRenderTarget(n,5,i),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,h),t.setRenderTarget(d,u,f),t.xr.enabled=m,n.texture.needsPMREMUpdate=!0}}class Jm extends on{constructor(t=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=t}}class jm{constructor(){this._previousTime=0,this._currentTime=0,this._startTime=performance.now(),this._delta=0,this._elapsed=0,this._timescale=1,this._document=null,this._pageVisibilityHandler=null}connect(t){this._document=t,t.hidden!==void 0&&(this._pageVisibilityHandler=Qm.bind(this),t.addEventListener("visibilitychange",this._pageVisibilityHandler,!1))}disconnect(){this._pageVisibilityHandler!==null&&(this._document.removeEventListener("visibilitychange",this._pageVisibilityHandler),this._pageVisibilityHandler=null),this._document=null}getDelta(){return this._delta/1e3}getElapsed(){return this._elapsed/1e3}getTimescale(){return this._timescale}setTimescale(t){return this._timescale=t,this}reset(){return this._currentTime=performance.now()-this._startTime,this}dispose(){this.disconnect()}update(t){return this._pageVisibilityHandler!==null&&this._document.hidden===!0?this._delta=0:(this._previousTime=this._currentTime,this._currentTime=(t!==void 0?t:performance.now())-this._startTime,this._delta=(this._currentTime-this._previousTime)*this._timescale,this._elapsed+=this._delta),this}}function Qm(){this._document.hidden===!1&&this.reset()}const lc="\\[\\]\\.:\\/",t0=new RegExp("["+lc+"]","g"),cc="[^"+lc+"]",e0="[^"+lc.replace("\\.","")+"]",n0=/((?:WC+[\/:])*)/.source.replace("WC",cc),i0=/(WCOD+)?/.source.replace("WCOD",e0),s0=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",cc),r0=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",cc),a0=new RegExp("^"+n0+i0+s0+r0+"$"),o0=["material","materials","bones","map"];class l0{constructor(t,e,n){const i=n||ge.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,i)}getValue(t,e){this.bind();const n=this._targetGroup.nCachedObjects_,i=this._bindings[n];i!==void 0&&i.getValue(t,e)}setValue(t,e){const n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,s=n.length;i!==s;++i)n[i].setValue(t,e)}bind(){const t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){const t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}}class ge{constructor(t,e,n){this.path=e,this.parsedPath=n||ge.parseTrackName(e),this.node=ge.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new ge.Composite(t,e,n):new ge(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(t0,"")}static parseTrackName(t){const e=a0.exec(t);if(e===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+t);const n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){const s=n.nodeName.substring(i+1);o0.indexOf(s)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=s)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){const n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){const n=function(s){for(let a=0;a<s.length;a++){const o=s[a];if(o.name===e||o.uuid===e)return o;const l=n(o.children);if(l)return l}return null},i=n(t.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){const n=this.resolvedProperty;for(let i=0,s=n.length;i!==s;++i)t[e++]=n[i]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){const n=this.resolvedProperty;for(let i=0,s=n.length;i!==s;++i)n[i]=t[e++]}_setValue_array_setNeedsUpdate(t,e){const n=this.resolvedProperty;for(let i=0,s=n.length;i!==s;++i)n[i]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){const n=this.resolvedProperty;for(let i=0,s=n.length;i!==s;++i)n[i]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node;const e=this.parsedPath,n=e.objectName,i=e.propertyName;let s=e.propertyIndex;if(t||(t=ge.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){Nt("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=e.objectIndex;switch(n){case"materials":if(!t.material){Ot("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){Ot("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){Ot("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let h=0;h<t.length;h++)if(t[h].name===c){c=h;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){Ot("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){Ot("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){Ot("PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(c!==void 0){if(t[c]===void 0){Ot("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[c]}}const a=t[i];if(a===void 0){const c=e.nodeName;Ot("PropertyBinding: Trying to update property for track: "+c+"."+i+" but it wasn't found.",t);return}let o=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?o=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(s!==void 0){if(i==="morphTargetInfluences"){if(!t.geometry){Ot("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){Ot("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[s]!==void 0&&(s=t.morphTargetDictionary[s])}l=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=s}else a.fromArray!==void 0&&a.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(l=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=i;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}}ge.Composite=l0,ge.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3},ge.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2},ge.prototype.GetterByBindingType=[ge.prototype._getValue_direct,ge.prototype._getValue_array,ge.prototype._getValue_arrayElement,ge.prototype._getValue_toArray],ge.prototype.SetterByBindingTypeAndVersioning=[[ge.prototype._setValue_direct,ge.prototype._setValue_direct_setNeedsUpdate,ge.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[ge.prototype._setValue_array,ge.prototype._setValue_array_setNeedsUpdate,ge.prototype._setValue_array_setMatrixWorldNeedsUpdate],[ge.prototype._setValue_arrayElement,ge.prototype._setValue_arrayElement_setNeedsUpdate,ge.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[ge.prototype._setValue_fromArray,ge.prototype._setValue_fromArray_setNeedsUpdate,ge.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];const Xu=new It;class c0{constructor(t,e,n=0,i=1/0){this.ray=new vs(t,e),this.near=n,this.far=i,this.camera=null,this.layers=new Ml,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(t,e){this.ray.set(t,e)}setFromCamera(t,e){e.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(t.x,t.y,.5).unproject(e).sub(this.ray.origin).normalize(),this.camera=e):e.isOrthographicCamera?(this.ray.origin.set(t.x,t.y,e.projectionMatrix.elements[14]).unproject(e),this.ray.direction.set(0,0,-1).transformDirection(e.matrixWorld),this.camera=e):Ot("Raycaster: Unsupported camera type: "+e.type)}setFromXRController(t){return Xu.identity().extractRotation(t.matrixWorld),this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(Xu),this}intersectObject(t,e=!0,n=[]){return hc(t,this,n,e),n.sort(Yu),n}intersectObjects(t,e=!0,n=[]){for(let i=0,s=t.length;i<s;i++)hc(t[i],this,n,e);return n.sort(Yu),n}}function Yu(r,t){return r.distance-t.distance}function hc(r,t,e,n){let i=!0;if(r.layers.test(t.layers)&&r.raycast(t,e)===!1&&(i=!1),i===!0&&n===!0){const s=r.children;for(let a=0,o=s.length;a<o;a++)hc(s[a],t,e,!0)}}class qu{constructor(t=1,e=0,n=0){this.radius=t,this.phi=e,this.theta=n}set(t,e,n){return this.radius=t,this.phi=e,this.theta=n,this}copy(t){return this.radius=t.radius,this.phi=t.phi,this.theta=t.theta,this}makeSafe(){return this.phi=qt(this.phi,1e-6,Math.PI-1e-6),this}setFromVector3(t){return this.setFromCartesianCoords(t.x,t.y,t.z)}setFromCartesianCoords(t,e,n){return this.radius=Math.sqrt(t*t+e*e+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(t,n),this.phi=Math.acos(qt(e/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}}const Jc=class Jc{constructor(t,e,n,i){this.elements=[1,0,0,1],t!==void 0&&this.set(t,e,n,i)}identity(){return this.set(1,0,0,1),this}fromArray(t,e=0){for(let n=0;n<4;n++)this.elements[n]=t[n+e];return this}set(t,e,n,i){const s=this.elements;return s[0]=t,s[2]=e,s[1]=n,s[3]=i,this}};Jc.prototype.isMatrix2=!0;let Zu=Jc;class h0 extends bi{constructor(t,e=null){super(),this.object=t,this.domElement=e,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(t){this.domElement!==null&&this.disconnect(),this.domElement=t}disconnect(){}dispose(){}update(){}}function $u(r,t,e,n){const i=u0(n);switch(e){case fh:return r*t;case $r:return r*t/i.components*i.byteLength;case Po:return r*t/i.components*i.byteLength;case zi:return r*t*2/i.components*i.byteLength;case Io:return r*t*2/i.components*i.byteLength;case dh:return r*t*3/i.components*i.byteLength;case gn:return r*t*4/i.components*i.byteLength;case Lo:return r*t*4/i.components*i.byteLength;case Kr:case Jr:return Math.floor((r+3)/4)*Math.floor((t+3)/4)*8;case jr:case Qr:return Math.floor((r+3)/4)*Math.floor((t+3)/4)*16;case Uo:case Fo:return Math.max(r,16)*Math.max(t,8)/4;case Do:case No:return Math.max(r,8)*Math.max(t,8)/2;case zo:case Oo:case ko:case Vo:return Math.floor((r+3)/4)*Math.floor((t+3)/4)*8;case Bo:case ta:case Ho:return Math.floor((r+3)/4)*Math.floor((t+3)/4)*16;case Go:return Math.floor((r+3)/4)*Math.floor((t+3)/4)*16;case Wo:return Math.floor((r+4)/5)*Math.floor((t+3)/4)*16;case Xo:return Math.floor((r+4)/5)*Math.floor((t+4)/5)*16;case Yo:return Math.floor((r+5)/6)*Math.floor((t+4)/5)*16;case qo:return Math.floor((r+5)/6)*Math.floor((t+5)/6)*16;case Zo:return Math.floor((r+7)/8)*Math.floor((t+4)/5)*16;case $o:return Math.floor((r+7)/8)*Math.floor((t+5)/6)*16;case Ko:return Math.floor((r+7)/8)*Math.floor((t+7)/8)*16;case Jo:return Math.floor((r+9)/10)*Math.floor((t+4)/5)*16;case jo:return Math.floor((r+9)/10)*Math.floor((t+5)/6)*16;case Qo:return Math.floor((r+9)/10)*Math.floor((t+7)/8)*16;case tl:return Math.floor((r+9)/10)*Math.floor((t+9)/10)*16;case el:return Math.floor((r+11)/12)*Math.floor((t+9)/10)*16;case nl:return Math.floor((r+11)/12)*Math.floor((t+11)/12)*16;case il:case sl:case rl:return Math.ceil(r/4)*Math.ceil(t/4)*16;case al:case ol:return Math.ceil(r/4)*Math.ceil(t/4)*8;case ea:case ll:return Math.ceil(r/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function u0(r){switch(r){case sn:case lh:return{byteLength:1,components:1};case js:case ch:case Je:return{byteLength:2,components:1};case Co:case Ro:return{byteLength:2,components:4};case qn:case Eo:case wn:return{byteLength:4,components:1};case hh:case uh:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${r}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"186"}})),typeof window<"u"&&(window.__THREE__?Nt("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="186");/**
 * @license
 * Copyright 2010-2026 Three.js Authors
 * SPDX-License-Identifier: MIT
 */function Ku(){let r=null,t=!1,e=null,n=null;function i(s,a){n=r.requestAnimationFrame(i),e(s,a)}return{start:function(){t!==!0&&e!==null&&r!==null&&(n=r.requestAnimationFrame(i),t=!0)},stop:function(){r!==null&&r.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(s){e=s},setContext:function(s){r=s}}}function f0(r){const t=new WeakMap;function e(o,l){const c=o.array,h=o.usage,d=c.byteLength,u=r.createBuffer();r.bindBuffer(l,u),r.bufferData(l,c,h),o.onUploadCallback();let f;if(c instanceof Float32Array)f=r.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)f=r.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?f=r.HALF_FLOAT:f=r.UNSIGNED_SHORT;else if(c instanceof Int16Array)f=r.SHORT;else if(c instanceof Uint32Array)f=r.UNSIGNED_INT;else if(c instanceof Int32Array)f=r.INT;else if(c instanceof Int8Array)f=r.BYTE;else if(c instanceof Uint8Array)f=r.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)f=r.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:u,type:f,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:d}}function n(o,l,c){const h=l.array,d=l.updateRanges;if(r.bindBuffer(c,o),d.length===0)r.bufferSubData(c,0,h);else{d.sort((f,m)=>f.start-m.start);let u=0;for(let f=1;f<d.length;f++){const m=d[u],_=d[f];_.start<=m.start+m.count+1?m.count=Math.max(m.count,_.start+_.count-m.start):(++u,d[u]=_)}d.length=u+1;for(let f=0,m=d.length;f<m;f++){const _=d[f];r.bufferSubData(c,_.start*h.BYTES_PER_ELEMENT,h,_.start,_.count)}l.clearUpdateRanges()}l.onUploadCallback()}function i(o){return o.isInterleavedBufferAttribute&&(o=o.data),t.get(o)}function s(o){o.isInterleavedBufferAttribute&&(o=o.data);const l=t.get(o);l&&(r.deleteBuffer(l.buffer),t.delete(o))}function a(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){const h=t.get(o);(!h||h.version<o.version)&&t.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}const c=t.get(o);if(c===void 0)t.set(o,e(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,o,l),c.version=o.version}}return{get:i,remove:s,update:a}}var d0=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,p0=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,m0=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,g0=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,x0=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,v0=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,_0=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,M0=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,y0=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,S0=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,b0=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,w0=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,A0=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,T0=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,E0=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,C0=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,R0=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,P0=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,I0=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,L0=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,D0=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,U0=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,N0=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,F0=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,z0=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,O0=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,B0=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,k0=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,V0=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,H0=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,G0="gl_FragColor = linearToOutputTexel( gl_FragColor );",W0=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,X0=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,Y0=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,q0=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Z0=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,$0=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,K0=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,J0=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,j0=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Q0=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,tg=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,eg=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,ng=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,ig=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,sg=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,rg=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureCubeUV( envMap, envMapRotation * retroVec, roughness );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_CUBE_UV
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,ag=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,og=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,lg=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,cg=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,hg=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,ug=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,fg=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,dg=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,pg=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,mg=`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,gg=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,xg=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,vg=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,_g=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Mg=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,yg=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Sg=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,bg=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,wg=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Ag=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,Tg=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,Eg=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Cg=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Rg=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,Pg=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Ig=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,Lg=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,Dg=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Ug=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Ng=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,Fg=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,zg=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,Og=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,Bg=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,kg=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Vg=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Hg=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,Gg=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Wg=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,Xg=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Yg=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,qg=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Zg=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,$g=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,Kg=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,Jg=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,jg=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,Qg=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,tx=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,ex=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,nx=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,ix=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,sx=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,rx=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,ax=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,ox=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,lx=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,cx=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,hx=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,ux=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,fx=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const $t={alphahash_fragment:d0,alphahash_pars_fragment:p0,alphamap_fragment:m0,alphamap_pars_fragment:g0,alphatest_fragment:x0,alphatest_pars_fragment:v0,aomap_fragment:_0,aomap_pars_fragment:M0,batching_pars_vertex:y0,batching_vertex:S0,begin_vertex:b0,beginnormal_vertex:w0,bsdfs:A0,iridescence_fragment:T0,bumpmap_pars_fragment:E0,clipping_planes_fragment:C0,clipping_planes_pars_fragment:R0,clipping_planes_pars_vertex:P0,clipping_planes_vertex:I0,color_fragment:L0,color_pars_fragment:D0,color_pars_vertex:U0,color_vertex:N0,common:F0,cube_uv_reflection_fragment:z0,defaultnormal_vertex:O0,displacementmap_pars_vertex:B0,displacementmap_vertex:k0,emissivemap_fragment:V0,emissivemap_pars_fragment:H0,colorspace_fragment:G0,colorspace_pars_fragment:W0,envmap_fragment:X0,envmap_common_pars_fragment:Y0,envmap_pars_fragment:q0,envmap_pars_vertex:Z0,envmap_physical_pars_fragment:rg,envmap_vertex:$0,fog_vertex:K0,fog_pars_vertex:J0,fog_fragment:j0,fog_pars_fragment:Q0,gradientmap_pars_fragment:tg,lightmap_pars_fragment:eg,lights_lambert_fragment:ng,lights_lambert_pars_fragment:ig,lights_pars_begin:sg,lights_toon_fragment:ag,lights_toon_pars_fragment:og,lights_phong_fragment:lg,lights_phong_pars_fragment:cg,lights_physical_fragment:hg,lights_physical_pars_fragment:ug,lights_fragment_begin:fg,lights_fragment_maps:dg,lights_fragment_end:pg,lightprobes_pars_fragment:mg,logdepthbuf_fragment:gg,logdepthbuf_pars_fragment:xg,logdepthbuf_pars_vertex:vg,logdepthbuf_vertex:_g,map_fragment:Mg,map_pars_fragment:yg,map_particle_fragment:Sg,map_particle_pars_fragment:bg,metalnessmap_fragment:wg,metalnessmap_pars_fragment:Ag,morphinstance_vertex:Tg,morphcolor_vertex:Eg,morphnormal_vertex:Cg,morphtarget_pars_vertex:Rg,morphtarget_vertex:Pg,normal_fragment_begin:Ig,normal_fragment_maps:Lg,normal_pars_fragment:Dg,normal_pars_vertex:Ug,normal_vertex:Ng,normalmap_pars_fragment:Fg,clearcoat_normal_fragment_begin:zg,clearcoat_normal_fragment_maps:Og,clearcoat_pars_fragment:Bg,iridescence_pars_fragment:kg,opaque_fragment:Vg,packing:Hg,premultiplied_alpha_fragment:Gg,project_vertex:Wg,dithering_fragment:Xg,dithering_pars_fragment:Yg,roughnessmap_fragment:qg,roughnessmap_pars_fragment:Zg,shadowmap_pars_fragment:$g,shadowmap_pars_vertex:Kg,shadowmap_vertex:Jg,shadowmask_pars_fragment:jg,skinbase_vertex:Qg,skinning_pars_vertex:tx,skinning_vertex:ex,skinnormal_vertex:nx,specularmap_fragment:ix,specularmap_pars_fragment:sx,tonemapping_fragment:rx,tonemapping_pars_fragment:ax,transmission_fragment:ox,transmission_pars_fragment:lx,uv_pars_fragment:cx,uv_pars_vertex:hx,uv_vertex:ux,worldpos_vertex:fx,background_vert:`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,background_frag:`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,backgroundCube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,backgroundCube_frag:`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,cube_frag:`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,depth_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,depth_frag:`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,distance_vert:`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,distance_frag:`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,equirect_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,equirect_frag:`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,linedashed_vert:`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,linedashed_frag:`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,meshbasic_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,meshbasic_frag:`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshlambert_vert:`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshlambert_frag:`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshmatcap_vert:`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,meshmatcap_frag:`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshnormal_vert:`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,meshnormal_frag:`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,meshphong_vert:`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshphong_frag:`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshphysical_vert:`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,meshphysical_frag:`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshtoon_vert:`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshtoon_frag:`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,points_vert:`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,points_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,shadow_vert:`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,shadow_frag:`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,sprite_vert:`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,sprite_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`},bt={common:{diffuse:{value:new pt(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Wt},alphaMap:{value:null},alphaMapTransform:{value:new Wt},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Wt}},envmap:{envMap:{value:null},envMapRotation:{value:new Wt},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Wt}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Wt}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Wt},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Wt},normalScale:{value:new ft(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Wt},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Wt}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Wt}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Wt}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new pt(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new L},probesMax:{value:new L},probesResolution:{value:new L}},points:{diffuse:{value:new pt(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Wt},alphaTest:{value:0},uvTransform:{value:new Wt}},sprite:{diffuse:{value:new pt(16777215)},opacity:{value:1},center:{value:new ft(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Wt},alphaMap:{value:null},alphaMapTransform:{value:new Wt},alphaTest:{value:0}}},ti={basic:{uniforms:an([bt.common,bt.specularmap,bt.envmap,bt.aomap,bt.lightmap,bt.fog]),vertexShader:$t.meshbasic_vert,fragmentShader:$t.meshbasic_frag},lambert:{uniforms:an([bt.common,bt.specularmap,bt.envmap,bt.aomap,bt.lightmap,bt.emissivemap,bt.bumpmap,bt.normalmap,bt.displacementmap,bt.fog,bt.lights,{emissive:{value:new pt(0)},envMapIntensity:{value:1}}]),vertexShader:$t.meshlambert_vert,fragmentShader:$t.meshlambert_frag},phong:{uniforms:an([bt.common,bt.specularmap,bt.envmap,bt.aomap,bt.lightmap,bt.emissivemap,bt.bumpmap,bt.normalmap,bt.displacementmap,bt.fog,bt.lights,{emissive:{value:new pt(0)},specular:{value:new pt(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:$t.meshphong_vert,fragmentShader:$t.meshphong_frag},standard:{uniforms:an([bt.common,bt.envmap,bt.aomap,bt.lightmap,bt.emissivemap,bt.bumpmap,bt.normalmap,bt.displacementmap,bt.roughnessmap,bt.metalnessmap,bt.fog,bt.lights,{emissive:{value:new pt(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:$t.meshphysical_vert,fragmentShader:$t.meshphysical_frag},toon:{uniforms:an([bt.common,bt.aomap,bt.lightmap,bt.emissivemap,bt.bumpmap,bt.normalmap,bt.displacementmap,bt.gradientmap,bt.fog,bt.lights,{emissive:{value:new pt(0)}}]),vertexShader:$t.meshtoon_vert,fragmentShader:$t.meshtoon_frag},matcap:{uniforms:an([bt.common,bt.bumpmap,bt.normalmap,bt.displacementmap,bt.fog,{matcap:{value:null}}]),vertexShader:$t.meshmatcap_vert,fragmentShader:$t.meshmatcap_frag},points:{uniforms:an([bt.points,bt.fog]),vertexShader:$t.points_vert,fragmentShader:$t.points_frag},dashed:{uniforms:an([bt.common,bt.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:$t.linedashed_vert,fragmentShader:$t.linedashed_frag},depth:{uniforms:an([bt.common,bt.displacementmap]),vertexShader:$t.depth_vert,fragmentShader:$t.depth_frag},normal:{uniforms:an([bt.common,bt.bumpmap,bt.normalmap,bt.displacementmap,{opacity:{value:1}}]),vertexShader:$t.meshnormal_vert,fragmentShader:$t.meshnormal_frag},sprite:{uniforms:an([bt.sprite,bt.fog]),vertexShader:$t.sprite_vert,fragmentShader:$t.sprite_frag},background:{uniforms:{uvTransform:{value:new Wt},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:$t.background_vert,fragmentShader:$t.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Wt}},vertexShader:$t.backgroundCube_vert,fragmentShader:$t.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:$t.cube_vert,fragmentShader:$t.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:$t.equirect_vert,fragmentShader:$t.equirect_frag},distance:{uniforms:an([bt.common,bt.displacementmap,{referencePosition:{value:new L},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:$t.distance_vert,fragmentShader:$t.distance_frag},shadow:{uniforms:an([bt.lights,bt.fog,{color:{value:new pt(0)},opacity:{value:1}}]),vertexShader:$t.shadow_vert,fragmentShader:$t.shadow_frag}};ti.physical={uniforms:an([ti.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Wt},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Wt},clearcoatNormalScale:{value:new ft(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Wt},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Wt},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Wt},sheen:{value:0},sheenColor:{value:new pt(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Wt},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Wt},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Wt},transmissionSamplerSize:{value:new ft},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Wt},attenuationDistance:{value:0},attenuationColor:{value:new pt(0)},specularColor:{value:new pt(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Wt},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Wt},anisotropyVector:{value:new ft},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Wt}}]),vertexShader:$t.meshphysical_vert,fragmentShader:$t.meshphysical_frag};const Ga={r:0,b:0,g:0},dx=new It,Ju=new Wt;Ju.set(-1,0,0,0,1,0,0,0,1);function px(r,t,e,n,i,s){const a=new pt(0);let o=i===!0?0:1,l,c,h=null,d=0,u=null;function f(v){let M=v.isScene===!0?v.background:null;if(M&&M.isTexture){const x=v.backgroundBlurriness>0;M=t.get(M,x)}return M}function m(v){let M=!1;const x=f(v);x===null?p(a,o):x&&x.isColor&&(p(x,1),M=!0);const b=r.xr.getEnvironmentBlendMode();b==="additive"?e.buffers.color.setClear(0,0,0,1,s):b==="alpha-blend"&&e.buffers.color.setClear(0,0,0,0,s),(r.autoClear||M)&&(e.buffers.depth.setTest(!0),e.buffers.depth.setMask(!0),e.buffers.color.setMask(!0),r.clear(r.autoClearColor,r.autoClearDepth,r.autoClearStencil))}function _(v,M){const x=f(M);x&&(x.isCubeTexture||x.mapping===Yr)?(c===void 0&&(c=new Xt(new ae(1,1,1),new le({name:"BackgroundCubeMaterial",uniforms:bs(ti.backgroundCube.uniforms),vertexShader:ti.backgroundCube.vertexShader,fragmentShader:ti.backgroundCube.fragmentShader,side:nn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(b,S,T){this.matrixWorld.copyPosition(T.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),c.material.uniforms.envMap.value=x,c.material.uniforms.backgroundBlurriness.value=M.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=M.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(dx.makeRotationFromEuler(M.backgroundRotation)).transpose(),x.isCubeTexture&&x.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(Ju),c.material.toneMapped=Qt.getTransfer(x.colorSpace)!==he,(h!==x||d!==x.version||u!==r.toneMapping)&&(c.material.needsUpdate=!0,h=x,d=x.version,u=r.toneMapping),c.layers.enableAll(),v.unshift(c,c.geometry,c.material,0,0,null)):x&&x.isTexture&&(l===void 0&&(l=new Xt(new Vn(2,2),new le({name:"BackgroundMaterial",uniforms:bs(ti.background.uniforms),vertexShader:ti.background.vertexShader,fragmentShader:ti.background.fragmentShader,side:Mi,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=x,l.material.uniforms.backgroundIntensity.value=M.backgroundIntensity,l.material.toneMapped=Qt.getTransfer(x.colorSpace)!==he,x.matrixAutoUpdate===!0&&x.updateMatrix(),l.material.uniforms.uvTransform.value.copy(x.matrix),(h!==x||d!==x.version||u!==r.toneMapping)&&(l.material.needsUpdate=!0,h=x,d=x.version,u=r.toneMapping),l.layers.enableAll(),v.unshift(l,l.geometry,l.material,0,0,null))}function p(v,M){v.getRGB(Ga,Pu(r)),e.buffers.color.setClear(Ga.r,Ga.g,Ga.b,M,s)}function g(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(v,M=1){a.set(v),o=M,p(a,o)},getClearAlpha:function(){return o},setClearAlpha:function(v){o=v,p(a,o)},render:m,addToRenderList:_,dispose:g}}function mx(r,t){const e=r.getParameter(r.MAX_VERTEX_ATTRIBS),n={},i=u(null);let s=i,a=!1;function o(P,D,N,R,B){let V=!1;const Y=d(P,R,N,D);s!==Y&&(s=Y,c(s.object)),V=f(P,R,N,B),V&&m(P,R,N,B),B!==null&&t.update(B,r.ELEMENT_ARRAY_BUFFER),(V||a)&&(a=!1,x(P,D,N,R),B!==null&&r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,t.get(B).buffer))}function l(){return r.createVertexArray()}function c(P){return r.bindVertexArray(P)}function h(P){return r.deleteVertexArray(P)}function d(P,D,N,R){const B=R.wireframe===!0;let V=n[D.id];V===void 0&&(V={},n[D.id]=V);const Y=P.isInstancedMesh===!0?P.id:0;let it=V[Y];it===void 0&&(it={},V[Y]=it);let Z=it[N.id];Z===void 0&&(Z={},it[N.id]=Z);let j=Z[B];return j===void 0&&(j=u(l()),Z[B]=j),j}function u(P){const D=[],N=[],R=[];for(let B=0;B<e;B++)D[B]=0,N[B]=0,R[B]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:D,enabledAttributes:N,attributeDivisors:R,object:P,attributes:{},index:null}}function f(P,D,N,R){const B=s.attributes,V=D.attributes;let Y=0;const it=N.getAttributes();for(const Z in it)if(it[Z].location>=0){const ct=B[Z];let xt=V[Z];if(xt===void 0&&(Z==="instanceMatrix"&&P.instanceMatrix&&(xt=P.instanceMatrix),Z==="instanceColor"&&P.instanceColor&&(xt=P.instanceColor)),ct===void 0||ct.attribute!==xt||xt&&ct.data!==xt.data)return!0;Y++}return s.attributesNum!==Y||s.index!==R}function m(P,D,N,R){const B={},V=D.attributes;let Y=0;const it=N.getAttributes();for(const Z in it)if(it[Z].location>=0){let ct=V[Z];ct===void 0&&(Z==="instanceMatrix"&&P.instanceMatrix&&(ct=P.instanceMatrix),Z==="instanceColor"&&P.instanceColor&&(ct=P.instanceColor));const xt={};xt.attribute=ct,ct&&ct.data&&(xt.data=ct.data),B[Z]=xt,Y++}s.attributes=B,s.attributesNum=Y,s.index=R}function _(){const P=s.newAttributes;for(let D=0,N=P.length;D<N;D++)P[D]=0}function p(P){g(P,0)}function g(P,D){const N=s.newAttributes,R=s.enabledAttributes,B=s.attributeDivisors;N[P]=1,R[P]===0&&(r.enableVertexAttribArray(P),R[P]=1),B[P]!==D&&(r.vertexAttribDivisor(P,D),B[P]=D)}function v(){const P=s.newAttributes,D=s.enabledAttributes;for(let N=0,R=D.length;N<R;N++)D[N]!==P[N]&&(r.disableVertexAttribArray(N),D[N]=0)}function M(P,D,N,R,B,V,Y){Y===!0?r.vertexAttribIPointer(P,D,N,B,V):r.vertexAttribPointer(P,D,N,R,B,V)}function x(P,D,N,R){_();const B=R.attributes,V=N.getAttributes(),Y=D.defaultAttributeValues;for(const it in V){const Z=V[it];if(Z.location>=0){let j=B[it];if(j===void 0&&(it==="instanceMatrix"&&P.instanceMatrix&&(j=P.instanceMatrix),it==="instanceColor"&&P.instanceColor&&(j=P.instanceColor)),j!==void 0){const ct=j.normalized,xt=j.itemSize,_t=t.get(j);if(_t===void 0)continue;const kt=_t.buffer,zt=_t.type,Dt=_t.bytesPerElement,st=zt===r.INT||zt===r.UNSIGNED_INT||j.gpuType===Eo;if(j.isInterleavedBufferAttribute){const rt=j.data,Mt=rt.stride,Lt=j.offset;if(rt.isInstancedInterleavedBuffer){for(let yt=0;yt<Z.locationSize;yt++)g(Z.location+yt,rt.meshPerAttribute);P.isInstancedMesh!==!0&&R._maxInstanceCount===void 0&&(R._maxInstanceCount=rt.meshPerAttribute*rt.count)}else for(let yt=0;yt<Z.locationSize;yt++)p(Z.location+yt);r.bindBuffer(r.ARRAY_BUFFER,kt);for(let yt=0;yt<Z.locationSize;yt++)M(Z.location+yt,xt/Z.locationSize,zt,ct,Mt*Dt,(Lt+xt/Z.locationSize*yt)*Dt,st)}else{if(j.isInstancedBufferAttribute){for(let rt=0;rt<Z.locationSize;rt++)g(Z.location+rt,j.meshPerAttribute);P.isInstancedMesh!==!0&&R._maxInstanceCount===void 0&&(R._maxInstanceCount=j.meshPerAttribute*j.count)}else for(let rt=0;rt<Z.locationSize;rt++)p(Z.location+rt);r.bindBuffer(r.ARRAY_BUFFER,kt);for(let rt=0;rt<Z.locationSize;rt++)M(Z.location+rt,xt/Z.locationSize,zt,ct,xt*Dt,xt/Z.locationSize*rt*Dt,st)}}else if(Y!==void 0){const ct=Y[it];if(ct!==void 0)switch(ct.length){case 2:r.vertexAttrib2fv(Z.location,ct);break;case 3:r.vertexAttrib3fv(Z.location,ct);break;case 4:r.vertexAttrib4fv(Z.location,ct);break;default:r.vertexAttrib1fv(Z.location,ct)}}}}v()}function b(){A();for(const P in n){const D=n[P];for(const N in D){const R=D[N];for(const B in R){const V=R[B];for(const Y in V)h(V[Y].object),delete V[Y];delete R[B]}}delete n[P]}}function S(P){if(n[P.id]===void 0)return;const D=n[P.id];for(const N in D){const R=D[N];for(const B in R){const V=R[B];for(const Y in V)h(V[Y].object),delete V[Y];delete R[B]}}delete n[P.id]}function T(P){for(const D in n){const N=n[D];for(const R in N){const B=N[R];if(B[P.id]===void 0)continue;const V=B[P.id];for(const Y in V)h(V[Y].object),delete V[Y];delete B[P.id]}}}function y(P){for(const D in n){const N=n[D],R=P.isInstancedMesh===!0?P.id:0,B=N[R];if(B!==void 0){for(const V in B){const Y=B[V];for(const it in Y)h(Y[it].object),delete Y[it];delete B[V]}delete N[R],Object.keys(N).length===0&&delete n[D]}}}function A(){E(),a=!0,s!==i&&(s=i,c(s.object))}function E(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:o,reset:A,resetDefaultState:E,dispose:b,releaseStatesOfGeometry:S,releaseStatesOfObject:y,releaseStatesOfProgram:T,initAttributes:_,enableAttribute:p,disableUnusedAttributes:v}}function gx(r,t,e){let n;function i(l){n=l}function s(l,c){r.drawArrays(n,l,c),e.update(c,n,1)}function a(l,c,h){h!==0&&(r.drawArraysInstanced(n,l,c,h),e.update(c,n,h))}function o(l,c,h){if(h===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,c,0,h);let u=0;for(let f=0;f<h;f++)u+=c[f];e.update(u,n,1)}this.setMode=i,this.render=s,this.renderInstances=a,this.renderMultiDraw=o}function xx(r,t,e,n){let i;function s(){if(i!==void 0)return i;if(t.has("EXT_texture_filter_anisotropic")===!0){const T=t.get("EXT_texture_filter_anisotropic");i=r.getParameter(T.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function a(T){return!(T!==gn&&n.convert(T)!==r.getParameter(r.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(T){const y=T===Je&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(T!==sn&&T!==wn&&!y&&n.convert(T)!==r.getParameter(r.IMPLEMENTATION_COLOR_READ_TYPE))}function l(T){if(T==="highp"){if(r.getShaderPrecisionFormat(r.VERTEX_SHADER,r.HIGH_FLOAT).precision>0&&r.getShaderPrecisionFormat(r.FRAGMENT_SHADER,r.HIGH_FLOAT).precision>0)return"highp";T="mediump"}return T==="mediump"&&r.getShaderPrecisionFormat(r.VERTEX_SHADER,r.MEDIUM_FLOAT).precision>0&&r.getShaderPrecisionFormat(r.FRAGMENT_SHADER,r.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=e.precision!==void 0?e.precision:"highp";const h=l(c);h!==c&&(Nt("WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);const d=e.logarithmicDepthBuffer===!0,u=e.reversedDepthBuffer===!0&&t.has("EXT_clip_control");e.reversedDepthBuffer===!0&&u===!1&&Nt("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");const f=r.getParameter(r.MAX_TEXTURE_IMAGE_UNITS),m=r.getParameter(r.MAX_VERTEX_TEXTURE_IMAGE_UNITS),_=r.getParameter(r.MAX_TEXTURE_SIZE),p=r.getParameter(r.MAX_CUBE_MAP_TEXTURE_SIZE),g=r.getParameter(r.MAX_VERTEX_ATTRIBS),v=r.getParameter(r.MAX_VERTEX_UNIFORM_VECTORS),M=r.getParameter(r.MAX_VARYING_VECTORS),x=r.getParameter(r.MAX_FRAGMENT_UNIFORM_VECTORS),b=r.getParameter(r.MAX_SAMPLES),S=r.getParameter(r.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:s,getMaxPrecision:l,textureFormatReadable:a,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:d,reversedDepthBuffer:u,maxTextures:f,maxVertexTextures:m,maxTextureSize:_,maxCubemapSize:p,maxAttributes:g,maxVertexUniforms:v,maxVaryings:M,maxFragmentUniforms:x,maxSamples:b,samples:S}}function vx(r){const t=this;let e=null,n=0,i=!1,s=!1;const a=new Kn,o=new Wt,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(d,u){const f=d.length!==0||u||n!==0||i;return i=u,n=d.length,f},this.beginShadows=function(){s=!0,h(null)},this.endShadows=function(){s=!1},this.setGlobalState=function(d,u){e=h(d,u,0)},this.setState=function(d,u,f){const m=d.clippingPlanes,_=d.clipIntersection,p=d.clipShadows,g=r.get(d);if(!i||m===null||m.length===0||s&&!p)s?h(null):c();else{const v=s?0:n,M=v*4;let x=g.clippingState||null;l.value=x,x=h(m,u,M,f);for(let b=0;b!==M;++b)x[b]=e[b];g.clippingState=x,this.numIntersection=_?this.numPlanes:0,this.numPlanes+=v}};function c(){l.value!==e&&(l.value=e,l.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function h(d,u,f,m){const _=d!==null?d.length:0;let p=null;if(_!==0){if(p=l.value,m!==!0||p===null){const g=f+_*4,v=u.matrixWorldInverse;o.getNormalMatrix(v),(p===null||p.length<g)&&(p=new Float32Array(g));for(let M=0,x=f;M!==_;++M,x+=4)a.copy(d[M]).applyMatrix4(v,o),a.normal.toArray(p,x),p[x+3]=a.constant}l.value=p,l.needsUpdate=!0}return t.numPlanes=_,t.numIntersection=0,p}}const Is=4,_x=6,Mx=20,yx=256,Nr=new Dr,ju=new pt;let uc=null,fc=0,dc=0,pc=!1;const Sx=new L,Wi=new L;class Qu{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(t,e=0,n=.1,i=100,s={}){const{size:a=256,position:o=Sx}=s;uc=this._renderer.getRenderTarget(),fc=this._renderer.getActiveCubeFace(),dc=this._renderer.getActiveMipmapLevel(),pc=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(t,n,i,l,o),e>0&&this._blur(l,0,0,e),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=nf(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=ef(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodMeshes.length;t++)this._lodMeshes[t].geometry.dispose()}_cleanup(t){this._renderer.setRenderTarget(uc,fc,dc),this._renderer.xr.enabled=pc,t.scissorTest=!1,Ls(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===Fi||t.mapping===Qi?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),uc=this._renderer.getRenderTarget(),fc=this._renderer.getActiveCubeFace(),dc=this._renderer.getActiveMipmapLevel(),pc=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:Ne,minFilter:Ne,generateMipmaps:!1,type:Je,format:gn,colorSpace:xn,depthBuffer:!1},i=tf(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=tf(t,e,n);const{_lodMax:s}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods}=bx(s)),this._blurMaterial=Ax(s,t,e),this._ggxMaterial=wx(s,t,e)}return i}_compileMaterial(t){const e=new Xt(new ve,t);this._renderer.compile(e,Nr)}_sceneToCubeUV(t,e,n,i,s){const l=new on(90,1,e,n),c=[1,-1,1,1,1,1],h=[1,1,1,-1,-1,-1],d=this._renderer,u=d.autoClear,f=d.toneMapping;d.getClearColor(ju),d.toneMapping=Yn,d.autoClear=!1,d.state.buffers.depth.getReversed()&&(d.setRenderTarget(i),d.clearDepth(),d.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new Xt(new ae,new Te({name:"PMREM.Background",side:nn,depthWrite:!1,depthTest:!1})));const _=this._backgroundBox,p=_.material;let g=!1;const v=t.background;v?v.isColor&&(p.color.copy(v),t.background=null,g=!0):(p.color.copy(ju),g=!0);for(let M=0;M<6;M++){const x=M%3;x===0?(l.up.set(0,c[M],0),l.position.set(s.x,s.y,s.z),l.lookAt(s.x+h[M],s.y,s.z)):x===1?(l.up.set(0,0,c[M]),l.position.set(s.x,s.y,s.z),l.lookAt(s.x,s.y+h[M],s.z)):(l.up.set(0,c[M],0),l.position.set(s.x,s.y,s.z),l.lookAt(s.x,s.y,s.z+h[M]));const b=this._cubeSize;Ls(i,x*b,M>2?b:0,b,b),d.setRenderTarget(i),g&&d.render(_,l),d.render(t,l)}d.toneMapping=f,d.autoClear=u,t.background=v}_textureToCubeUV(t,e){const n=this._renderer,i=t.mapping===Fi||t.mapping===Qi;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=nf()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=ef());const s=i?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=s;const o=s.uniforms;o.envMap.value=t;const l=this._cubeSize;Ls(e,0,0,3*l,2*l),n.setRenderTarget(e),n.render(a,Nr)}_applyPMREM(t){const e=this._renderer,n=e.autoClear;e.autoClear=!1;const i=this._lodMeshes.length;for(let s=1;s<i;s++)this._applyGGXFilter(t,s-1,s);e.autoClear=n}_applyGGXFilter(t,e,n){const i=this._renderer,s=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;const l=a.uniforms,c=n/(this._lodMeshes.length-1),h=e/(this._lodMeshes.length-1),d=Math.sqrt(c*c-h*h),u=c*1.25,f=d*u,{_lodMax:m}=this,_=this._sizeLods[n],p=3*_*(n>m-Is?n-m+Is:0),g=4*(this._cubeSize-_);l.envMap.value=t.texture,l.roughness.value=f,l.mipInt.value=m-e,Ls(s,p,g,3*_,2*_),i.setRenderTarget(s),i.render(o,Nr),l.envMap.value=s.texture,l.roughness.value=0,l.mipInt.value=m-n,Ls(t,p,g,3*_,2*_),i.setRenderTarget(t),i.render(o,Nr)}_blur(t,e,n,i){const s=this._pingPongRenderTarget,a=Math.min(i,Math.PI)/Math.SQRT2;this._blurPass(t,s,e,n,a),this._blurPass(s,t,n,n,a)}_blurPass(t,e,n,i,s){const a=this._renderer,o=this._blurMaterial,l=this._lodMeshes[i];l.material=o;const c=o.uniforms;c.envMap.value=t.texture,c.sigma.value=s,c.mipInt.value=this._lodMax-n;const h=this._sizeLods[i],d=3*h*(i>this._lodMax-Is?i-this._lodMax+Is:0),u=4*(this._cubeSize-h);Ls(e,d,u,3*h,2*h),a.setRenderTarget(e),a.render(l,Nr)}}function bx(r){const t=[],e=[];let n=r;const i=r-Is+1+_x;for(let s=0;s<i;s++){const a=Math.pow(2,n);t.push(a);const o=1/(a-2),l=-o,c=1+o,h=[l,l,c,l,c,c,l,l,c,c,l,c],d=6,u=6,f=3,m=new Float32Array(f*u*d),_=new Float32Array(f*u*d);for(let g=0;g<d;g++){const v=g%3*2/3-1,M=g>2?0:-1,x=[v,M,0,v+2/3,M,0,v+2/3,M+1,0,v,M,0,v+2/3,M+1,0,v,M+1,0];m.set(x,f*u*g);for(let b=0;b<u;b++){const S=h[b*2]*2-1,T=h[b*2+1]*2-1;g===0?Wi.set(1,T,S):g===1?Wi.set(-S,1,-T):g===2?Wi.set(-S,T,1):g===3?Wi.set(-1,T,-S):g===4?Wi.set(-S,-1,T):Wi.set(S,T,-1),Wi.toArray(_,(g*u+b)*f)}}const p=new ve;p.setAttribute("position",new Pe(m,f)),p.setAttribute("outputDirection",new Pe(_,f)),e.push(new Xt(p,null)),n>Is&&n--}return{lodMeshes:e,sizeLods:t}}function tf(r,t,e){const n=new $e(r,t,e);return n.texture.mapping=Yr,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Ls(r,t,e,n,i){r.viewport.set(t,e,n,i),r.scissor.set(t,e,n,i)}function wx(r,t,e){return new le({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:yx,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${r}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Wa(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:Ze,depthTest:!1,depthWrite:!1})}function Ax(r,t,e){return new le({name:"SphericalGaussianBlur",defines:{SAMPLES:Mx,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${r}.0`},uniforms:{envMap:{value:null},sigma:{value:0},mipInt:{value:0}},vertexShader:Wa(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float sigma;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359
			#define GOLDEN_ANGLE 2.39996322973

			void main() {

				if ( sigma == 0.0 ) {

					gl_FragColor = vec4( bilinearCubeUV( envMap, vOutputDirection, mipInt ), 1.0 );
					return;

				}

				vec3 outputDirection = normalize( vOutputDirection );

				vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
				vec3 tangent = normalize( cross( up, outputDirection ) );
				vec3 bitangent = cross( outputDirection, tangent );

				// Truncate the kernel at three standard deviations or at the antipode.
				float thetaMax = min( 3.0 * sigma, PI );
				float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

				vec3 accumColor = vec3( 0.0 );
				float accumWeight = 0.0;

				for ( int i = 0; i < SAMPLES; i ++ ) {

					// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
					float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
					float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
					float phi = float( i ) * GOLDEN_ANGLE;

					vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
					vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

					// Correct the planar sample density to solid angle.
					float weight = sin( theta ) / theta;

					accumColor += weight * bilinearCubeUV( envMap, sampleDirection, mipInt );
					accumWeight += weight;

				}

				gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

			}
		`,blending:Ze,depthTest:!1,depthWrite:!1})}function ef(){return new le({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Wa(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Ze,depthTest:!1,depthWrite:!1})}function nf(){return new le({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Wa(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Ze,depthTest:!1,depthWrite:!1})}function Wa(){return`

		precision mediump float;
		precision mediump int;

		attribute vec3 outputDirection;

		varying vec3 vOutputDirection;

		void main() {

			vOutputDirection = outputDirection;
			gl_Position = vec4( position, 1.0 );

		}
	`}class sf extends $e{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;const n={width:t,height:t,depth:1},i=[n,n,n,n,n,n];this.texture=new hu(i),this._setTextureOptions(e),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},i=new ae(5,5,5),s=new le({name:"CubemapFromEquirect",uniforms:bs(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:nn,blending:Ze});s.uniforms.tEquirect.value=e;const a=new Xt(i,s),o=e.minFilter;return e.minFilter===oi&&(e.minFilter=Ne),new Km(1,10,this).update(t,a),e.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(t,e=!0,n=!0,i=!0){const s=t.getRenderTarget();for(let a=0;a<6;a++)t.setRenderTarget(this,a),t.clear(e,n,i);t.setRenderTarget(s)}}function Tx(r){let t=new WeakMap,e=new WeakMap,n=null;function i(u,f=!1){return u==null?null:f?a(u):s(u)}function s(u){if(u&&u.isTexture){const f=u.mapping;if(f===Xr||f===To)if(t.has(u)){const m=t.get(u).texture;return o(m,u.mapping)}else{const m=u.image;if(m&&m.height>0){const _=new sf(m.height);return _.fromEquirectangularTexture(r,u),t.set(u,_),u.addEventListener("dispose",c),o(_.texture,u.mapping)}else return null}}return u}function a(u){if(u&&u.isTexture){const f=u.mapping,m=f===Xr||f===To,_=f===Fi||f===Qi;if(m||_){let p=e.get(u);const g=p!==void 0?p.texture.pmremVersion:0;if(u.isRenderTargetTexture&&u.pmremVersion!==g)return n===null&&(n=new Qu(r)),p=m?n.fromEquirectangular(u,p):n.fromCubemap(u,p),p.texture.pmremVersion=u.pmremVersion,e.set(u,p),p.texture;if(p!==void 0)return p.texture;{const v=u.image;return m&&v&&v.height>0||_&&v&&l(v)?(n===null&&(n=new Qu(r)),p=m?n.fromEquirectangular(u):n.fromCubemap(u),p.texture.pmremVersion=u.pmremVersion,e.set(u,p),u.addEventListener("dispose",h),p.texture):null}}}return u}function o(u,f){return f===Xr?u.mapping=Fi:f===To&&(u.mapping=Qi),u}function l(u){let f=0;const m=6;for(let _=0;_<m;_++)u[_]!==void 0&&f++;return f===m}function c(u){const f=u.target;f.removeEventListener("dispose",c);const m=t.get(f);m!==void 0&&(t.delete(f),m.dispose())}function h(u){const f=u.target;f.removeEventListener("dispose",h);const m=e.get(f);m!==void 0&&(e.delete(f),m.dispose())}function d(){t=new WeakMap,e=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:i,dispose:d}}function Ex(r){const t={};function e(n){if(t[n]!==void 0)return t[n];const i=r.getExtension(n);return t[n]=i,i}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){const i=e(n);return i===null&&es("WebGLRenderer: "+n+" extension not supported."),i}}}function Cx(r,t,e,n){const i={},s=new WeakMap;function a(d){const u=d.target;u.index!==null&&t.remove(u.index);for(const m in u.attributes)t.remove(u.attributes[m]);u.removeEventListener("dispose",a),delete i[u.id];const f=s.get(u);f&&(t.remove(f),s.delete(u)),n.releaseStatesOfGeometry(u),u.isInstancedBufferGeometry===!0&&delete u._maxInstanceCount,e.memory.geometries--}function o(d,u){return i[u.id]===!0||(u.addEventListener("dispose",a),i[u.id]=!0,e.memory.geometries++),u}function l(d){const u=d.attributes;for(const f in u)t.update(u[f],r.ARRAY_BUFFER)}function c(d){const u=[],f=d.index,m=d.attributes.position;let _=0;if(m===void 0)return;if(f!==null){const v=f.array;_=f.version;for(let M=0,x=v.length;M<x;M+=3){const b=v[M+0],S=v[M+1],T=v[M+2];u.push(b,S,S,T,T,b)}}else{const v=m.array;_=m.version;for(let M=0,x=v.length/3-1;M<x;M+=3){const b=M+0,S=M+1,T=M+2;u.push(b,S,S,T,T,b)}}const p=new(m.count>=65535?Oh:zh)(u,1);p.version=_;const g=s.get(d);g&&t.remove(g),s.set(d,p)}function h(d){const u=s.get(d);if(u){const f=d.index;f!==null&&u.version<f.version&&c(d)}else c(d);return s.get(d)}return{get:o,update:l,getWireframeAttribute:h}}function Rx(r,t,e){let n;function i(d){n=d}let s,a;function o(d){s=d.type,a=d.bytesPerElement}function l(d,u){r.drawElements(n,u,s,d*a),e.update(u,n,1)}function c(d,u,f){f!==0&&(r.drawElementsInstanced(n,u,s,d*a,f),e.update(u,n,f))}function h(d,u,f){if(f===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,u,0,s,d,0,f);let _=0;for(let p=0;p<f;p++)_+=u[p];e.update(_,n,1)}this.setMode=i,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=h}function Px(r){const t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(s,a,o){switch(e.calls++,a){case r.TRIANGLES:e.triangles+=o*(s/3);break;case r.LINES:e.lines+=o*(s/2);break;case r.LINE_STRIP:e.lines+=o*(s-1);break;case r.LINE_LOOP:e.lines+=o*s;break;case r.POINTS:e.points+=o*s;break;default:Ot("WebGLInfo: Unknown draw mode:",a);break}}function i(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:i,update:n}}function Ix(r,t,e){const n=new WeakMap,i=new ue;function s(a,o,l){const c=a.morphTargetInfluences,h=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,d=h!==void 0?h.length:0;let u=n.get(o);if(u===void 0||u.count!==d){let A=function(){T.dispose(),n.delete(o),o.removeEventListener("dispose",A)};u!==void 0&&u.texture.dispose();const f=o.morphAttributes.position!==void 0,m=o.morphAttributes.normal!==void 0,_=o.morphAttributes.color!==void 0,p=o.morphAttributes.position||[],g=o.morphAttributes.normal||[],v=o.morphAttributes.color||[];let M=0;f===!0&&(M=1),m===!0&&(M=2),_===!0&&(M=3);let x=o.attributes.position.count*M,b=1;x>t.maxTextureSize&&(b=Math.ceil(x/t.maxTextureSize),x=t.maxTextureSize);const S=new Float32Array(x*b*4*d),T=new Eh(S,x,b,d);T.type=wn,T.needsUpdate=!0;const y=M*4;for(let E=0;E<d;E++){const P=p[E],D=g[E],N=v[E],R=x*b*4*E;for(let B=0;B<P.count;B++){const V=B*y;f===!0&&(i.fromBufferAttribute(P,B),S[R+V+0]=i.x,S[R+V+1]=i.y,S[R+V+2]=i.z,S[R+V+3]=0),m===!0&&(i.fromBufferAttribute(D,B),S[R+V+4]=i.x,S[R+V+5]=i.y,S[R+V+6]=i.z,S[R+V+7]=0),_===!0&&(i.fromBufferAttribute(N,B),S[R+V+8]=i.x,S[R+V+9]=i.y,S[R+V+10]=i.z,S[R+V+11]=N.itemSize===4?i.w:1)}}u={count:d,texture:T,size:new ft(x,b)},n.set(o,u),o.addEventListener("dispose",A)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)l.getUniforms().setValue(r,"morphTexture",a.morphTexture,e);else{let f=0;for(let _=0;_<c.length;_++)f+=c[_];const m=o.morphTargetsRelative?1:1-f;l.getUniforms().setValue(r,"morphTargetBaseInfluence",m),l.getUniforms().setValue(r,"morphTargetInfluences",c)}l.getUniforms().setValue(r,"morphTargetsTexture",u.texture,e),l.getUniforms().setValue(r,"morphTargetsTextureSize",u.size)}return{update:s}}function Lx(r,t,e,n,i){let s=new WeakMap;function a(c){const h=i.render.frame,d=c.geometry,u=t.get(c,d);if(s.get(u)!==h&&(t.update(u),s.set(u,h)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),s.get(c)!==h&&(e.update(c.instanceMatrix,r.ARRAY_BUFFER),c.instanceColor!==null&&e.update(c.instanceColor,r.ARRAY_BUFFER),s.set(c,h))),c.isSkinnedMesh){const f=c.skeleton;s.get(f)!==h&&(f.update(),s.set(f,h))}return u}function o(){s=new WeakMap}function l(c){const h=c.target;h.removeEventListener("dispose",l),n.releaseStatesOfObject(h),e.remove(h.instanceMatrix),h.instanceColor!==null&&e.remove(h.instanceColor)}return{update:a,dispose:o}}const Dx={[Mo]:"LINEAR_TONE_MAPPING",[yo]:"REINHARD_TONE_MAPPING",[So]:"CINEON_TONE_MAPPING",[Wr]:"ACES_FILMIC_TONE_MAPPING",[wo]:"AGX_TONE_MAPPING",[Ao]:"NEUTRAL_TONE_MAPPING",[bo]:"CUSTOM_TONE_MAPPING"};function Ux(r,t,e,n,i,s){const a=new $e(t,e,{type:r,depthBuffer:i,stencilBuffer:s,samples:n?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1});let o=null,l=null;const c=new ve;c.setAttribute("position",new Zt([-1,3,0,-1,-1,0,3,-1,0],3)),c.setAttribute("uv",new Zt([0,2,0,0,2,0],2));const h=new Iu({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),d=new Xt(c,h),u=new Dr(-1,1,1,-1,0,1);let f=null,m=null,_=!1,p,g=null,v=[],M=!1;this.setSize=function(x,b){a.setSize(x,b),o!==null&&o.setSize(x,b),l!==null&&l.setSize(x,b);for(let S=0;S<v.length;S++){const T=v[S];T.setSize&&T.setSize(x,b)}},this.setEffects=function(x){v=x,M=v.length>0&&v[0].isRenderPass===!0;const b=a.width,S=a.height;v.length>0&&o===null&&(o=new $e(b,S,{type:Je,depthBuffer:!1,stencilBuffer:!1}),l=new $e(b,S,{type:Je,depthBuffer:!1,stencilBuffer:!1}));for(let T=0;T<v.length;T++){const y=v[T];y.setSize&&y.setSize(b,S)}},this.begin=function(x,b){if(_||x.toneMapping===Yn&&v.length===0)return!1;if(g=b,b!==null){const S=b.width,T=b.height;(a.width!==S||a.height!==T)&&this.setSize(S,T)}return M===!1&&x.setRenderTarget(a),p=x.toneMapping,x.toneMapping=Yn,!0},this.hasRenderPass=function(){return M},this.end=function(x,b){x.toneMapping=p,_=!0;let S=a,T=o;for(let y=0;y<v.length;y++){const A=v[y];A.enabled!==!1&&(A.render(x,T,S,b),A.needsSwap!==!1&&(S=T,T=T===o?l:o))}if(f!==x.outputColorSpace||m!==x.toneMapping){f=x.outputColorSpace,m=x.toneMapping,h.defines={},Qt.getTransfer(f)===he&&(h.defines.SRGB_TRANSFER="");const y=Dx[m];y&&(h.defines[y]=""),h.needsUpdate=!0}h.uniforms.tDiffuse.value=S.texture,x.setRenderTarget(g),x.render(d,u),g=null,_=!1},this.isCompositing=function(){return _},this.dispose=function(){a.dispose(),o!==null&&o.dispose(),l!==null&&l.dispose(),c.dispose(),h.dispose()}}const rf=new Re,mc=new ys(1,1),af=new Eh,of=new yp,lf=new hu,cf=[],hf=[],uf=new Float32Array(16),ff=new Float32Array(9),df=new Float32Array(4);function Ds(r,t,e){const n=r[0];if(n<=0||n>0)return r;const i=t*e;let s=cf[i];if(s===void 0&&(s=new Float32Array(i),cf[i]=s),t!==0){n.toArray(s,0);for(let a=1,o=0;a!==t;++a)o+=e,r[a].toArray(s,o)}return s}function Ge(r,t){if(r.length!==t.length)return!1;for(let e=0,n=r.length;e<n;e++)if(r[e]!==t[e])return!1;return!0}function We(r,t){for(let e=0,n=t.length;e<n;e++)r[e]=t[e]}function Xa(r,t){let e=hf[t];e===void 0&&(e=new Int32Array(t),hf[t]=e);for(let n=0;n!==t;++n)e[n]=r.allocateTextureUnit();return e}function Nx(r,t){const e=this.cache;e[0]!==t&&(r.uniform1f(this.addr,t),e[0]=t)}function Fx(r,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(r.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Ge(e,t))return;r.uniform2fv(this.addr,t),We(e,t)}}function zx(r,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(r.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(r.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(Ge(e,t))return;r.uniform3fv(this.addr,t),We(e,t)}}function Ox(r,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(r.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Ge(e,t))return;r.uniform4fv(this.addr,t),We(e,t)}}function Bx(r,t){const e=this.cache,n=t.elements;if(n===void 0){if(Ge(e,t))return;r.uniformMatrix2fv(this.addr,!1,t),We(e,t)}else{if(Ge(e,n))return;df.set(n),r.uniformMatrix2fv(this.addr,!1,df),We(e,n)}}function kx(r,t){const e=this.cache,n=t.elements;if(n===void 0){if(Ge(e,t))return;r.uniformMatrix3fv(this.addr,!1,t),We(e,t)}else{if(Ge(e,n))return;ff.set(n),r.uniformMatrix3fv(this.addr,!1,ff),We(e,n)}}function Vx(r,t){const e=this.cache,n=t.elements;if(n===void 0){if(Ge(e,t))return;r.uniformMatrix4fv(this.addr,!1,t),We(e,t)}else{if(Ge(e,n))return;uf.set(n),r.uniformMatrix4fv(this.addr,!1,uf),We(e,n)}}function Hx(r,t){const e=this.cache;e[0]!==t&&(r.uniform1i(this.addr,t),e[0]=t)}function Gx(r,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(r.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Ge(e,t))return;r.uniform2iv(this.addr,t),We(e,t)}}function Wx(r,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(r.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Ge(e,t))return;r.uniform3iv(this.addr,t),We(e,t)}}function Xx(r,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(r.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Ge(e,t))return;r.uniform4iv(this.addr,t),We(e,t)}}function Yx(r,t){const e=this.cache;e[0]!==t&&(r.uniform1ui(this.addr,t),e[0]=t)}function qx(r,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(r.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Ge(e,t))return;r.uniform2uiv(this.addr,t),We(e,t)}}function Zx(r,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(r.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Ge(e,t))return;r.uniform3uiv(this.addr,t),We(e,t)}}function $x(r,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(r.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Ge(e,t))return;r.uniform4uiv(this.addr,t),We(e,t)}}function Kx(r,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(r.uniform1i(this.addr,i),n[0]=i);let s;this.type===r.SAMPLER_2D_SHADOW?(mc.compareFunction=e.isReversedDepthBuffer()?dl:fl,s=mc):s=rf,e.setTexture2D(t||s,i)}function Jx(r,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(r.uniform1i(this.addr,i),n[0]=i),e.setTexture3D(t||of,i)}function jx(r,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(r.uniform1i(this.addr,i),n[0]=i),e.setTextureCube(t||lf,i)}function Qx(r,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(r.uniform1i(this.addr,i),n[0]=i),e.setTexture2DArray(t||af,i)}function tv(r){switch(r){case 5126:return Nx;case 35664:return Fx;case 35665:return zx;case 35666:return Ox;case 35674:return Bx;case 35675:return kx;case 35676:return Vx;case 5124:case 35670:return Hx;case 35667:case 35671:return Gx;case 35668:case 35672:return Wx;case 35669:case 35673:return Xx;case 5125:return Yx;case 36294:return qx;case 36295:return Zx;case 36296:return $x;case 35678:case 36198:case 36298:case 36306:case 35682:return Kx;case 35679:case 36299:case 36307:return Jx;case 35680:case 36300:case 36308:case 36293:return jx;case 36289:case 36303:case 36311:case 36292:return Qx}}function ev(r,t){r.uniform1fv(this.addr,t)}function nv(r,t){const e=Ds(t,this.size,2);r.uniform2fv(this.addr,e)}function iv(r,t){const e=Ds(t,this.size,3);r.uniform3fv(this.addr,e)}function sv(r,t){const e=Ds(t,this.size,4);r.uniform4fv(this.addr,e)}function rv(r,t){const e=Ds(t,this.size,4);r.uniformMatrix2fv(this.addr,!1,e)}function av(r,t){const e=Ds(t,this.size,9);r.uniformMatrix3fv(this.addr,!1,e)}function ov(r,t){const e=Ds(t,this.size,16);r.uniformMatrix4fv(this.addr,!1,e)}function lv(r,t){r.uniform1iv(this.addr,t)}function cv(r,t){r.uniform2iv(this.addr,t)}function hv(r,t){r.uniform3iv(this.addr,t)}function uv(r,t){r.uniform4iv(this.addr,t)}function fv(r,t){r.uniform1uiv(this.addr,t)}function dv(r,t){r.uniform2uiv(this.addr,t)}function pv(r,t){r.uniform3uiv(this.addr,t)}function mv(r,t){r.uniform4uiv(this.addr,t)}function gv(r,t,e){const n=this.cache,i=t.length,s=Xa(e,i);Ge(n,s)||(r.uniform1iv(this.addr,s),We(n,s));let a;this.type===r.SAMPLER_2D_SHADOW?a=mc:a=rf;for(let o=0;o!==i;++o)e.setTexture2D(t[o]||a,s[o])}function xv(r,t,e){const n=this.cache,i=t.length,s=Xa(e,i);Ge(n,s)||(r.uniform1iv(this.addr,s),We(n,s));for(let a=0;a!==i;++a)e.setTexture3D(t[a]||of,s[a])}function vv(r,t,e){const n=this.cache,i=t.length,s=Xa(e,i);Ge(n,s)||(r.uniform1iv(this.addr,s),We(n,s));for(let a=0;a!==i;++a)e.setTextureCube(t[a]||lf,s[a])}function _v(r,t,e){const n=this.cache,i=t.length,s=Xa(e,i);Ge(n,s)||(r.uniform1iv(this.addr,s),We(n,s));for(let a=0;a!==i;++a)e.setTexture2DArray(t[a]||af,s[a])}function Mv(r){switch(r){case 5126:return ev;case 35664:return nv;case 35665:return iv;case 35666:return sv;case 35674:return rv;case 35675:return av;case 35676:return ov;case 5124:case 35670:return lv;case 35667:case 35671:return cv;case 35668:case 35672:return hv;case 35669:case 35673:return uv;case 5125:return fv;case 36294:return dv;case 36295:return pv;case 36296:return mv;case 35678:case 36198:case 36298:case 36306:case 35682:return gv;case 35679:case 36299:case 36307:return xv;case 35680:case 36300:case 36308:case 36293:return vv;case 36289:case 36303:case 36311:case 36292:return _v}}class yv{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=tv(e.type)}}class Sv{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=Mv(e.type)}}class bv{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){const i=this.seq;for(let s=0,a=i.length;s!==a;++s){const o=i[s];o.setValue(t,e[o.id],n)}}}const gc=/(\w+)(\])?(\[|\.)?/g;function pf(r,t){r.seq.push(t),r.map[t.id]=t}function wv(r,t,e){const n=r.name,i=n.length;for(gc.lastIndex=0;;){const s=gc.exec(n),a=gc.lastIndex;let o=s[1];const l=s[2]==="]",c=s[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===i){pf(e,c===void 0?new yv(o,r,t):new Sv(o,r,t));break}else{let d=e.map[o];d===void 0&&(d=new bv(o),pf(e,d)),e=d}}}class Ya{constructor(t,e){this.seq=[],this.map={};const n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){const o=t.getActiveUniform(e,a),l=t.getUniformLocation(e,o.name);wv(o,l,this)}const i=[],s=[];for(const a of this.seq)a.type===t.SAMPLER_2D_SHADOW||a.type===t.SAMPLER_CUBE_SHADOW||a.type===t.SAMPLER_2D_ARRAY_SHADOW?i.push(a):s.push(a);i.length>0&&(this.seq=i.concat(s))}setValue(t,e,n,i){const s=this.map[e];s!==void 0&&s.setValue(t,n,i)}setOptional(t,e,n){const i=e[n];i!==void 0&&this.setValue(t,n,i)}static upload(t,e,n,i){for(let s=0,a=e.length;s!==a;++s){const o=e[s],l=n[o.id];l.needsUpdate!==!1&&o.setValue(t,l.value,i)}}static seqWithValue(t,e){const n=[];for(let i=0,s=t.length;i!==s;++i){const a=t[i];a.id in e&&n.push(a)}return n}}function mf(r,t,e){const n=r.createShader(t);return r.shaderSource(n,e),r.compileShader(n),n}const Av=37297;let Tv=0;function Ev(r,t){const e=r.split(`
`),n=[],i=Math.max(t-6,0),s=Math.min(t+6,e.length);for(let a=i;a<s;a++){const o=a+1;n.push(`${o===t?">":" "} ${o}: ${e[a]}`)}return n.join(`
`)}const gf=new Wt;function Cv(r){Qt._getMatrix(gf,Qt.workingColorSpace,r);const t=`mat3( ${gf.elements.map(e=>e.toFixed(4))} )`;switch(Qt.getTransfer(r)){case na:return[t,"LinearTransferOETF"];case he:return[t,"sRGBTransferOETF"];default:return Nt("WebGLProgram: Unsupported color space: ",r),[t,"LinearTransferOETF"]}}function xf(r,t,e){const n=r.getShaderParameter(t,r.COMPILE_STATUS),s=(r.getShaderInfoLog(t)||"").trim();if(n&&s==="")return"";const a=/ERROR: 0:(\d+)/.exec(s);if(a){const o=parseInt(a[1]);return e.toUpperCase()+`

`+s+`

`+Ev(r.getShaderSource(t),o)}else return s}function Rv(r,t){const e=Cv(t);return[`vec4 ${r}( vec4 value ) {`,`	return ${e[1]}( vec4( value.rgb * ${e[0]}, value.a ) );`,"}"].join(`
`)}const Pv={[Mo]:"Linear",[yo]:"Reinhard",[So]:"Cineon",[Wr]:"ACESFilmic",[wo]:"AgX",[Ao]:"Neutral",[bo]:"Custom"};function Iv(r,t){const e=Pv[t];return e===void 0?(Nt("WebGLProgram: Unsupported toneMapping:",t),"vec3 "+r+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+r+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}const qa=new L;function Lv(){Qt.getLuminanceCoefficients(qa);const r=qa.x.toFixed(4),t=qa.y.toFixed(4),e=qa.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${r}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Dv(r){return[r.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",r.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Fr).join(`
`)}function Uv(r){const t=[];for(const e in r){const n=r[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function Nv(r,t){const e={},n=r.getProgramParameter(t,r.ACTIVE_ATTRIBUTES);for(let i=0;i<n;i++){const s=r.getActiveAttrib(t,i),a=s.name;let o=1;s.type===r.FLOAT_MAT2&&(o=2),s.type===r.FLOAT_MAT3&&(o=3),s.type===r.FLOAT_MAT4&&(o=4),e[a]={type:s.type,location:r.getAttribLocation(t,a),locationSize:o}}return e}function Fr(r){return r!==""}function vf(r,t){const e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return r.replace(/NUM_SUN_LIGHTS/g,t.numSunLights).replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,t.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function _f(r,t){return r.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}const Fv=/^[ \t]*#include +<([\w\d./]+)>/gm;function xc(r){return r.replace(Fv,Ov)}const zv=new Map;function Ov(r,t){let e=$t[t];if(e===void 0){const n=zv.get(t);if(n!==void 0)e=$t[n],Nt('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+t+">")}return xc(e)}const Bv=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Mf(r){return r.replace(Bv,kv)}function kv(r,t,e,n){let i="";for(let s=parseInt(t);s<parseInt(e);s++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+s+" ]").replace(/UNROLLED_LOOP_INDEX/g,s);return i}function yf(r){let t=`precision ${r.precision} float;
	precision ${r.precision} int;
	precision ${r.precision} sampler2D;
	precision ${r.precision} samplerCube;
	precision ${r.precision} sampler3D;
	precision ${r.precision} sampler2DArray;
	precision ${r.precision} sampler2DShadow;
	precision ${r.precision} samplerCubeShadow;
	precision ${r.precision} sampler2DArrayShadow;
	precision ${r.precision} isampler2D;
	precision ${r.precision} isampler3D;
	precision ${r.precision} isamplerCube;
	precision ${r.precision} isampler2DArray;
	precision ${r.precision} usampler2D;
	precision ${r.precision} usampler3D;
	precision ${r.precision} usamplerCube;
	precision ${r.precision} usampler2DArray;
	`;return r.precision==="highp"?t+=`
#define HIGH_PRECISION`:r.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:r.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}const Vv={[qs]:"SHADOWMAP_TYPE_PCF",[Zs]:"SHADOWMAP_TYPE_VSM"};function Hv(r){return Vv[r.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}const Gv={[Fi]:"ENVMAP_TYPE_CUBE",[Qi]:"ENVMAP_TYPE_CUBE",[Yr]:"ENVMAP_TYPE_CUBE_UV"};function Wv(r){return r.envMap===!1?"ENVMAP_TYPE_CUBE":Gv[r.envMapMode]||"ENVMAP_TYPE_CUBE"}const Xv={[Qi]:"ENVMAP_MODE_REFRACTION"};function Yv(r){return r.envMap===!1?"ENVMAP_MODE_REFLECTION":Xv[r.envMapMode]||"ENVMAP_MODE_REFLECTION"}const qv={[_o]:"ENVMAP_BLENDING_MULTIPLY",[Nd]:"ENVMAP_BLENDING_MIX",[Fd]:"ENVMAP_BLENDING_ADD"};function Zv(r){return r.envMap===!1?"ENVMAP_BLENDING_NONE":qv[r.combine]||"ENVMAP_BLENDING_NONE"}function $v(r){const t=r.envMapCubeUVHeight;if(t===null)return null;const e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),112)),texelHeight:n,maxMip:e}}function Kv(r,t,e,n){const i=r.getContext(),s=e.defines;let a=e.vertexShader,o=e.fragmentShader;const l=Hv(e),c=Wv(e),h=Yv(e),d=Zv(e),u=$v(e),f=Dv(e),m=Uv(s),_=i.createProgram();let p,g,v=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(p=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,m].filter(Fr).join(`
`),p.length>0&&(p+=`
`),g=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,m].filter(Fr).join(`
`),g.length>0&&(g+=`
`)):(p=[yf(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,m,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+h:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexNormals?"#define HAS_NORMAL":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Fr).join(`
`),g=[yf(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,m,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+c:"",e.envMap?"#define "+h:"",e.envMap?"#define "+d:"",u?"#define CUBEUV_TEXEL_WIDTH "+u.texelWidth:"",u?"#define CUBEUV_TEXEL_HEIGHT "+u.texelHeight:"",u?"#define CUBEUV_MAX_MIP "+u.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.retroreflection?"#define USE_RETROREFLECTION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor?"#define USE_COLOR":"",e.vertexAlphas||e.batchingColor?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==Yn?"#define TONE_MAPPING":"",e.toneMapping!==Yn?$t.tonemapping_pars_fragment:"",e.toneMapping!==Yn?Iv("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",$t.colorspace_pars_fragment,Rv("linearToOutputTexel",e.outputColorSpace),Lv(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(Fr).join(`
`)),a=xc(a),a=vf(a,e),a=_f(a,e),o=xc(o),o=vf(o,e),o=_f(o,e),a=Mf(a),o=Mf(o),e.isRawShaderMaterial!==!0&&(v=`#version 300 es
`,p=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+p,g=["#define varying in",e.glslVersion===Mh?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===Mh?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+g);const M=v+p+a,x=v+g+o,b=mf(i,i.VERTEX_SHADER,M),S=mf(i,i.FRAGMENT_SHADER,x);i.attachShader(_,b),i.attachShader(_,S),e.index0AttributeName!==void 0?i.bindAttribLocation(_,0,e.index0AttributeName):e.hasPositionAttribute===!0&&i.bindAttribLocation(_,0,"position"),i.linkProgram(_);function T(P){if(r.debug.checkShaderErrors){const D=i.getProgramInfoLog(_)||"",N=i.getShaderInfoLog(b)||"",R=i.getShaderInfoLog(S)||"",B=D.trim(),V=N.trim(),Y=R.trim();let it=!0,Z=!0;if(i.getProgramParameter(_,i.LINK_STATUS)===!1)if(it=!1,typeof r.debug.onShaderError=="function")r.debug.onShaderError(i,_,b,S);else{const j=xf(i,b,"vertex"),ct=xf(i,S,"fragment");Ot("WebGLProgram: Shader Error "+i.getError()+" - VALIDATE_STATUS "+i.getProgramParameter(_,i.VALIDATE_STATUS)+`

Material Name: `+P.name+`
Material Type: `+P.type+`

Program Info Log: `+B+`
`+j+`
`+ct)}else B!==""?Nt("WebGLProgram: Program Info Log:",B):(V===""||Y==="")&&(Z=!1);Z&&(P.diagnostics={runnable:it,programLog:B,vertexShader:{log:V,prefix:p},fragmentShader:{log:Y,prefix:g}})}i.deleteShader(b),i.deleteShader(S),y=new Ya(i,_),A=Nv(i,_)}let y;this.getUniforms=function(){return y===void 0&&T(this),y};let A;this.getAttributes=function(){return A===void 0&&T(this),A};let E=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return E===!1&&(E=i.getProgramParameter(_,Av)),E},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(_),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=Tv++,this.cacheKey=t,this.usedTimes=1,this.program=_,this.vertexShader=b,this.fragmentShader=S,this}let Jv=0;class jv{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t,e,n){const i=this._getShaderCacheForMaterial(t);return i.has(e)===!1&&(i.add(e),e.usedTimes++),i.has(n)===!1&&(i.add(n),n.usedTimes++),this}remove(t){const e=this.materialCache.get(t);for(const n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderStage(t){return this._getShaderStage(t.vertexShader)}getFragmentShaderStage(t){return this._getShaderStage(t.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){const e=this.materialCache;let n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){const e=this.shaderCache;let n=e.get(t);return n===void 0&&(n=new Qv(t),e.set(t,n)),n}}class Qv{constructor(t){this.id=Jv++,this.code=t,this.usedTimes=0}}function t_(r){return r===zi||r===ta||r===ea}function e_(r,t,e,n,i,s){const a=new Ml,o=new jv,l=new Set,c=[],h=new Map,d=n.logarithmicDepthBuffer;let u=n.precision;const f={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function m(y){return l.add(y),y===0?"uv":`uv${y}`}function _(y,A,E,P,D,N){const R=P.fog,B=D.geometry,V=y.isMeshStandardMaterial||y.isMeshLambertMaterial||y.isMeshPhongMaterial?P.environment:null,Y=y.isMeshStandardMaterial||y.isMeshLambertMaterial&&!y.envMap||y.isMeshPhongMaterial&&!y.envMap,it=t.get(y.envMap||V,Y),Z=it&&it.mapping===Yr?it.image.height:null,j=f[y.type];y.precision!==null&&(u=n.getMaxPrecision(y.precision),u!==y.precision&&Nt("WebGLProgram.getParameters:",y.precision,"not supported, using",u,"instead."));const ct=B.morphAttributes.position||B.morphAttributes.normal||B.morphAttributes.color,xt=ct!==void 0?ct.length:0;let _t=0;B.morphAttributes.position!==void 0&&(_t=1),B.morphAttributes.normal!==void 0&&(_t=2),B.morphAttributes.color!==void 0&&(_t=3);let kt,zt,Dt,st;if(j){const de=ti[j];kt=de.vertexShader,zt=de.fragmentShader}else{kt=y.vertexShader,zt=y.fragmentShader;const de=o.getVertexShaderStage(y),oe=o.getFragmentShaderStage(y);o.update(y,de,oe),Dt=de.id,st=oe.id}const rt=r.getRenderTarget(),Mt=r.state.buffers.depth.getReversed(),Lt=D.isInstancedMesh===!0,yt=D.isBatchedMesh===!0,Bt=!!y.map,_e=!!y.matcap,Gt=!!it,Vt=!!y.aoMap,Kt=!!y.lightMap,Ht=!!y.bumpMap&&y.wireframe===!1,ee=!!y.normalMap,fe=!!y.displacementMap,Le=!!y.emissiveMap,jt=!!y.metalnessMap,se=!!y.roughnessMap,H=y.anisotropy>0,Ce=y.clearcoat>0,Yt=y.dispersion>0,U=y.retroreflectivity>0,w=y.iridescence>0,q=y.sheen>0,K=y.transmission>0,ot=H&&!!y.anisotropyMap,k=Ce&&!!y.clearcoatMap,$=Ce&&!!y.clearcoatNormalMap,X=Ce&&!!y.clearcoatRoughnessMap,nt=w&&!!y.iridescenceMap,mt=w&&!!y.iridescenceThicknessMap,z=q&&!!y.sheenColorMap,O=q&&!!y.sheenRoughnessMap,W=!!y.specularMap,Q=!!y.specularColorMap,dt=!!y.specularIntensityMap,ht=K&&!!y.transmissionMap,I=K&&!!y.thicknessMap,lt=!!y.gradientMap,J=!!y.alphaMap,gt=y.alphaTest>0,vt=!!y.alphaHash,ut=!!y.extensions;let St=Yn;y.toneMapped&&(rt===null||rt.isXRRenderTarget===!0)&&(St=r.toneMapping);const wt={shaderID:j,shaderType:y.type,shaderName:y.name,vertexShader:kt,fragmentShader:zt,defines:y.defines,customVertexShaderID:Dt,customFragmentShaderID:st,isRawShaderMaterial:y.isRawShaderMaterial===!0,glslVersion:y.glslVersion,precision:u,batching:yt,batchingColor:yt&&D._colorsTexture!==null,instancing:Lt,instancingColor:Lt&&D.instanceColor!==null,instancingMorph:Lt&&D.morphTexture!==null,outputColorSpace:rt===null?r.outputColorSpace:rt.isXRRenderTarget===!0?rt.texture.colorSpace:Qt.workingColorSpace,alphaToCoverage:!!y.alphaToCoverage,map:Bt,matcap:_e,envMap:Gt,envMapMode:Gt&&it.mapping,envMapCubeUVHeight:Z,aoMap:Vt,lightMap:Kt,bumpMap:Ht,normalMap:ee,displacementMap:fe,emissiveMap:Le,normalMapObjectSpace:ee&&y.normalMapType===Vd,normalMapTangentSpace:ee&&y.normalMapType===er,packedNormalMap:ee&&y.normalMapType===er&&t_(y.normalMap.format),metalnessMap:jt,roughnessMap:se,anisotropy:H,anisotropyMap:ot,clearcoat:Ce,clearcoatMap:k,clearcoatNormalMap:$,clearcoatRoughnessMap:X,dispersion:Yt,retroreflection:U,iridescence:w,iridescenceMap:nt,iridescenceThicknessMap:mt,sheen:q,sheenColorMap:z,sheenRoughnessMap:O,specularMap:W,specularColorMap:Q,specularIntensityMap:dt,transmission:K,transmissionMap:ht,thicknessMap:I,gradientMap:lt,opaque:y.transparent===!1&&y.blending===ji&&y.alphaToCoverage===!1,alphaMap:J,alphaTest:gt,alphaHash:vt,combine:y.combine,mapUv:Bt&&m(y.map.channel),aoMapUv:Vt&&m(y.aoMap.channel),lightMapUv:Kt&&m(y.lightMap.channel),bumpMapUv:Ht&&m(y.bumpMap.channel),normalMapUv:ee&&m(y.normalMap.channel),displacementMapUv:fe&&m(y.displacementMap.channel),emissiveMapUv:Le&&m(y.emissiveMap.channel),metalnessMapUv:jt&&m(y.metalnessMap.channel),roughnessMapUv:se&&m(y.roughnessMap.channel),anisotropyMapUv:ot&&m(y.anisotropyMap.channel),clearcoatMapUv:k&&m(y.clearcoatMap.channel),clearcoatNormalMapUv:$&&m(y.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:X&&m(y.clearcoatRoughnessMap.channel),iridescenceMapUv:nt&&m(y.iridescenceMap.channel),iridescenceThicknessMapUv:mt&&m(y.iridescenceThicknessMap.channel),sheenColorMapUv:z&&m(y.sheenColorMap.channel),sheenRoughnessMapUv:O&&m(y.sheenRoughnessMap.channel),specularMapUv:W&&m(y.specularMap.channel),specularColorMapUv:Q&&m(y.specularColorMap.channel),specularIntensityMapUv:dt&&m(y.specularIntensityMap.channel),transmissionMapUv:ht&&m(y.transmissionMap.channel),thicknessMapUv:I&&m(y.thicknessMap.channel),alphaMapUv:J&&m(y.alphaMap.channel),vertexTangents:!!B.attributes.tangent&&(ee||H),vertexNormals:!!B.attributes.normal,vertexColors:y.vertexColors,vertexAlphas:y.vertexColors===!0&&!!B.attributes.color&&B.attributes.color.itemSize===4,pointsUvs:D.isPoints===!0&&!!B.attributes.uv&&(Bt||J),fog:!!R,useFog:y.fog===!0,fogExp2:!!R&&R.isFogExp2,flatShading:y.wireframe===!1&&(y.flatShading===!0||B.attributes.normal===void 0&&ee===!1&&(y.isMeshLambertMaterial||y.isMeshPhongMaterial||y.isMeshStandardMaterial||y.isMeshPhysicalMaterial)),sizeAttenuation:y.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:Mt,skinning:D.isSkinnedMesh===!0,hasPositionAttribute:B.attributes.position!==void 0,morphTargets:B.morphAttributes.position!==void 0,morphNormals:B.morphAttributes.normal!==void 0,morphColors:B.morphAttributes.color!==void 0,morphTargetsCount:xt,morphTextureStride:_t,numSunLights:A.sun.length,numDirLights:A.directional.length,numPointLights:A.point.length,numSpotLights:A.spot.length,numSpotLightMaps:A.spotLightMap.length,numRectAreaLights:A.rectArea.length,numHemiLights:A.hemi.length,numSunLightShadows:A.sunShadowMap.length,numDirLightShadows:A.directionalShadowMap.length,numPointLightShadows:A.pointShadowMap.length,numSpotLightShadows:A.spotShadowMap.length,numSpotLightShadowsWithMaps:A.numSpotLightShadowsWithMaps,numLightProbes:A.numLightProbes,numLightProbeGrids:N.length,numClippingPlanes:s.numPlanes,numClipIntersection:s.numIntersection,dithering:y.dithering,shadowMapEnabled:r.shadowMap.enabled&&E.length>0,shadowMapType:r.shadowMap.type,toneMapping:St,decodeVideoTexture:Bt&&y.map.isVideoTexture===!0&&Qt.getTransfer(y.map.colorSpace)===he,decodeVideoTextureEmissive:Le&&y.emissiveMap.isVideoTexture===!0&&Qt.getTransfer(y.emissiveMap.colorSpace)===he,premultipliedAlpha:y.premultipliedAlpha,doubleSided:y.side===qe,flipSided:y.side===nn,useDepthPacking:y.depthPacking>=0,depthPacking:y.depthPacking||0,index0AttributeName:y.index0AttributeName,extensionClipCullDistance:ut&&y.extensions.clipCullDistance===!0&&e.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(ut&&y.extensions.multiDraw===!0||yt)&&e.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:e.has("KHR_parallel_shader_compile"),customProgramCacheKey:y.customProgramCacheKey()};return wt.vertexUv1s=l.has(1),wt.vertexUv2s=l.has(2),wt.vertexUv3s=l.has(3),l.clear(),wt}function p(y){const A=[];if(y.shaderID?A.push(y.shaderID):(A.push(y.customVertexShaderID),A.push(y.customFragmentShaderID)),y.defines!==void 0)for(const E in y.defines)A.push(E),A.push(y.defines[E]);return y.isRawShaderMaterial===!1&&(g(A,y),v(A,y),A.push(r.outputColorSpace)),A.push(y.customProgramCacheKey),A.join()}function g(y,A){y.push(A.precision),y.push(A.outputColorSpace),y.push(A.envMapMode),y.push(A.envMapCubeUVHeight),y.push(A.mapUv),y.push(A.alphaMapUv),y.push(A.lightMapUv),y.push(A.aoMapUv),y.push(A.bumpMapUv),y.push(A.normalMapUv),y.push(A.displacementMapUv),y.push(A.emissiveMapUv),y.push(A.metalnessMapUv),y.push(A.roughnessMapUv),y.push(A.anisotropyMapUv),y.push(A.clearcoatMapUv),y.push(A.clearcoatNormalMapUv),y.push(A.clearcoatRoughnessMapUv),y.push(A.iridescenceMapUv),y.push(A.iridescenceThicknessMapUv),y.push(A.sheenColorMapUv),y.push(A.sheenRoughnessMapUv),y.push(A.specularMapUv),y.push(A.specularColorMapUv),y.push(A.specularIntensityMapUv),y.push(A.transmissionMapUv),y.push(A.thicknessMapUv),y.push(A.combine),y.push(A.fogExp2),y.push(A.sizeAttenuation),y.push(A.morphTargetsCount),y.push(A.morphAttributeCount),y.push(A.numSunLights),y.push(A.numDirLights),y.push(A.numPointLights),y.push(A.numSpotLights),y.push(A.numSpotLightMaps),y.push(A.numHemiLights),y.push(A.numRectAreaLights),y.push(A.numSunLightShadows),y.push(A.numDirLightShadows),y.push(A.numPointLightShadows),y.push(A.numSpotLightShadows),y.push(A.numSpotLightShadowsWithMaps),y.push(A.numLightProbes),y.push(A.shadowMapType),y.push(A.toneMapping),y.push(A.numClippingPlanes),y.push(A.numClipIntersection),y.push(A.depthPacking)}function v(y,A){a.disableAll(),A.instancing&&a.enable(0),A.instancingColor&&a.enable(1),A.instancingMorph&&a.enable(2),A.matcap&&a.enable(3),A.envMap&&a.enable(4),A.normalMapObjectSpace&&a.enable(5),A.normalMapTangentSpace&&a.enable(6),A.clearcoat&&a.enable(7),A.iridescence&&a.enable(8),A.alphaTest&&a.enable(9),A.vertexColors&&a.enable(10),A.vertexAlphas&&a.enable(11),A.vertexUv1s&&a.enable(12),A.vertexUv2s&&a.enable(13),A.vertexUv3s&&a.enable(14),A.vertexTangents&&a.enable(15),A.anisotropy&&a.enable(16),A.alphaHash&&a.enable(17),A.batching&&a.enable(18),A.dispersion&&a.enable(19),A.retroreflection&&a.enable(24),A.batchingColor&&a.enable(20),A.gradientMap&&a.enable(21),A.packedNormalMap&&a.enable(22),A.vertexNormals&&a.enable(23),y.push(a.mask),a.disableAll(),A.fog&&a.enable(0),A.useFog&&a.enable(1),A.flatShading&&a.enable(2),A.logarithmicDepthBuffer&&a.enable(3),A.reversedDepthBuffer&&a.enable(4),A.skinning&&a.enable(5),A.morphTargets&&a.enable(6),A.morphNormals&&a.enable(7),A.morphColors&&a.enable(8),A.premultipliedAlpha&&a.enable(9),A.shadowMapEnabled&&a.enable(10),A.doubleSided&&a.enable(11),A.flipSided&&a.enable(12),A.useDepthPacking&&a.enable(13),A.dithering&&a.enable(14),A.transmission&&a.enable(15),A.sheen&&a.enable(16),A.opaque&&a.enable(17),A.pointsUvs&&a.enable(18),A.decodeVideoTexture&&a.enable(19),A.decodeVideoTextureEmissive&&a.enable(20),A.alphaToCoverage&&a.enable(21),A.numLightProbeGrids>0&&a.enable(22),A.hasPositionAttribute&&a.enable(23),y.push(a.mask)}function M(y){const A=f[y.type];let E;if(A){const P=ti[A];E=Hn.clone(P.uniforms)}else E=y.uniforms;return E}function x(y,A){let E=h.get(A);return E!==void 0?++E.usedTimes:(E=new Kv(r,A,y,i),c.push(E),h.set(A,E)),E}function b(y){if(--y.usedTimes===0){const A=c.indexOf(y);c[A]=c[c.length-1],c.pop(),h.delete(y.cacheKey),y.destroy()}}function S(y){o.remove(y)}function T(){o.dispose()}return{getParameters:_,getProgramCacheKey:p,getUniforms:M,acquireProgram:x,releaseProgram:b,releaseShaderCache:S,programs:c,dispose:T}}function n_(){let r=new WeakMap;function t(a){return r.has(a)}function e(a){let o=r.get(a);return o===void 0&&(o={},r.set(a,o)),o}function n(a){r.delete(a)}function i(a,o,l){r.get(a)[o]=l}function s(){r=new WeakMap}return{has:t,get:e,remove:n,update:i,dispose:s}}function i_(r,t){return r.groupOrder!==t.groupOrder?r.groupOrder-t.groupOrder:r.renderOrder!==t.renderOrder?r.renderOrder-t.renderOrder:r.material.id!==t.material.id?r.material.id-t.material.id:r.materialVariant!==t.materialVariant?r.materialVariant-t.materialVariant:r.z!==t.z?r.z-t.z:r.id-t.id}function Sf(r,t){return r.groupOrder!==t.groupOrder?r.groupOrder-t.groupOrder:r.renderOrder!==t.renderOrder?r.renderOrder-t.renderOrder:r.z!==t.z?t.z-r.z:r.id-t.id}function bf(){const r=[];let t=0;const e=[],n=[],i=[];function s(){t=0,e.length=0,n.length=0,i.length=0}function a(u){let f=0;return u.isInstancedMesh&&(f+=2),u.isSkinnedMesh&&(f+=1),f}function o(u,f,m,_,p,g){let v=r[t];return v===void 0?(v={id:u.id,object:u,geometry:f,material:m,materialVariant:a(u),groupOrder:_,renderOrder:u.renderOrder,z:p,group:g},r[t]=v):(v.id=u.id,v.object=u,v.geometry=f,v.material=m,v.materialVariant=a(u),v.groupOrder=_,v.renderOrder=u.renderOrder,v.z=p,v.group=g),t++,v}function l(u,f,m,_,p,g,v){v.reversedDepth===!0&&(p=-p);const M=o(u,f,m,_,p,g);m.transmission>0?n.push(M):m.transparent===!0?i.push(M):e.push(M)}function c(u,f,m,_,p,g){const v=o(u,f,m,_,p,g);m.transmission>0?n.unshift(v):m.transparent===!0?i.unshift(v):e.unshift(v)}function h(u,f){e.length>1&&e.sort(u||i_),n.length>1&&n.sort(f||Sf),i.length>1&&i.sort(f||Sf)}function d(){for(let u=t,f=r.length;u<f;u++){const m=r[u];if(m.id===null)break;m.id=null,m.object=null,m.geometry=null,m.material=null,m.group=null}}return{opaque:e,transmissive:n,transparent:i,init:s,push:l,unshift:c,finish:d,sort:h}}function s_(){let r=new WeakMap;function t(n,i){const s=r.get(n);let a;return s===void 0?(a=new bf,r.set(n,[a])):i>=s.length?(a=new bf,s.push(a)):a=s[i],a}function e(){r=new WeakMap}return{get:t,dispose:e}}function r_(){const r={};return{get:function(t){if(r[t.id]!==void 0)return r[t.id];let e;switch(t.type){case"SunLight":case"DirectionalLight":e={direction:new L,color:new pt};break;case"SpotLight":e={position:new L,direction:new L,color:new pt,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new L,color:new pt,distance:0,decay:0};break;case"HemisphereLight":e={direction:new L,skyColor:new pt,groundColor:new pt};break;case"RectAreaLight":e={color:new pt,position:new L,halfWidth:new L,halfHeight:new L};break}return r[t.id]=e,e}}}function a_(){const r={};return{get:function(t){if(r[t.id]!==void 0)return r[t.id];let e;switch(t.type){case"SunLight":case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ft};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ft};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ft,shadowCameraNear:1,shadowCameraFar:1e3};break}return r[t.id]=e,e}}}let o_=0;function l_(r,t){return(t.castShadow?2:0)-(r.castShadow?2:0)+(t.map?1:0)-(r.map?1:0)}function c_(r){const t=new r_,e=a_(),n={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new L);const i=new L,s=new It,a=new It;function o(c){let h=0,d=0,u=0;for(let D=0;D<9;D++)n.probe[D].set(0,0,0);let f=0,m=0,_=0,p=0,g=0,v=0,M=0,x=0,b=0,S=0,T=0,y=0,A=0,E=0;c.sort(l_);for(let D=0,N=c.length;D<N;D++){const R=c[D],B=R.color,V=R.intensity,Y=R.distance;let it=null;if(R.shadow&&R.shadow.map&&(R.shadow.map.texture.format===zi?it=R.shadow.map.texture:it=R.shadow.map.depthTexture||R.shadow.map.texture),R.isAmbientLight)h+=B.r*V,d+=B.g*V,u+=B.b*V;else if(R.isLightProbe){for(let Z=0;Z<9;Z++)n.probe[Z].addScaledVector(R.sh.coefficients[Z],V);E++}else if(R.isSunLight){const Z=t.get(R);if(Z.color.copy(R.color).multiplyScalar(R.intensity),R.castShadow){const j=R.shadow,ct=e.get(R);ct.shadowIntensity=j.intensity,ct.shadowBias=j.bias,ct.shadowNormalBias=j.normalBias,ct.shadowRadius=j.radius,ct.shadowMapSize.copy(j.mapSize).multiply(j.getFrameExtents()),n.sunShadow[m]=ct,n.sunShadowMap[m]=it;const xt=j.getViewportCount();for(let _t=0;_t<xt;_t++)n.sunShadowMatrix[_+_t]=j.getMatrix(_t),n.sunShadowCascade[_+_t]=j._cascadeData[_t];_+=xt,m++}n.sun[f]=Z,f++}else if(R.isDirectionalLight){const Z=t.get(R);if(Z.color.copy(R.color).multiplyScalar(R.intensity),R.castShadow){const j=R.shadow,ct=e.get(R);ct.shadowIntensity=j.intensity,ct.shadowBias=j.bias,ct.shadowNormalBias=j.normalBias,ct.shadowRadius=j.radius,ct.shadowMapSize=j.mapSize,n.directionalShadow[p]=ct,n.directionalShadowMap[p]=it,n.directionalShadowMatrix[p]=R.shadow.matrix,b++}n.directional[p]=Z,p++}else if(R.isSpotLight){const Z=t.get(R);Z.position.setFromMatrixPosition(R.matrixWorld),Z.color.copy(B).multiplyScalar(V),Z.distance=Y,Z.coneCos=Math.cos(R.angle),Z.penumbraCos=Math.cos(R.angle*(1-R.penumbra)),Z.decay=R.decay,n.spot[v]=Z;const j=R.shadow;if(R.map&&(n.spotLightMap[y]=R.map,y++,j.updateMatrices(R),R.castShadow&&A++),n.spotLightMatrix[v]=j.matrix,R.castShadow){const ct=e.get(R);ct.shadowIntensity=j.intensity,ct.shadowBias=j.bias,ct.shadowNormalBias=j.normalBias,ct.shadowRadius=j.radius,ct.shadowMapSize=j.mapSize,n.spotShadow[v]=ct,n.spotShadowMap[v]=it,T++}v++}else if(R.isRectAreaLight){const Z=t.get(R);Z.color.copy(B).multiplyScalar(V),Z.halfWidth.set(R.width*.5,0,0),Z.halfHeight.set(0,R.height*.5,0),n.rectArea[M]=Z,M++}else if(R.isPointLight){const Z=t.get(R);if(Z.color.copy(R.color).multiplyScalar(R.intensity),Z.distance=R.distance,Z.decay=R.decay,R.castShadow){const j=R.shadow,ct=e.get(R);ct.shadowIntensity=j.intensity,ct.shadowBias=j.bias,ct.shadowNormalBias=j.normalBias,ct.shadowRadius=j.radius,ct.shadowMapSize=j.mapSize,ct.shadowCameraNear=j.camera.near,ct.shadowCameraFar=j.camera.far,n.pointShadow[g]=ct,n.pointShadowMap[g]=it,n.pointShadowMatrix[g]=R.shadow.matrix,S++}n.point[g]=Z,g++}else if(R.isHemisphereLight){const Z=t.get(R);Z.skyColor.copy(R.color).multiplyScalar(V),Z.groundColor.copy(R.groundColor).multiplyScalar(V),n.hemi[x]=Z,x++}}M>0&&(r.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=bt.LTC_FLOAT_1,n.rectAreaLTC2=bt.LTC_FLOAT_2):(n.rectAreaLTC1=bt.LTC_HALF_1,n.rectAreaLTC2=bt.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=d,n.ambient[2]=u;const P=n.hash;(P.sunLength!==f||P.directionalLength!==p||P.pointLength!==g||P.spotLength!==v||P.rectAreaLength!==M||P.hemiLength!==x||P.numSunShadows!==m||P.numDirectionalShadows!==b||P.numPointShadows!==S||P.numSpotShadows!==T||P.numSpotMaps!==y||P.numLightProbes!==E)&&(n.sun.length=f,n.directional.length=p,n.spot.length=v,n.rectArea.length=M,n.point.length=g,n.hemi.length=x,n.sunShadow.length=m,n.sunShadowMap.length=m,n.sunShadowMatrix.length=_,n.sunShadowCascade.length=_,n.directionalShadow.length=b,n.directionalShadowMap.length=b,n.directionalShadowMatrix.length=b,n.pointShadow.length=S,n.pointShadowMap.length=S,n.pointShadowMatrix.length=S,n.spotShadow.length=T,n.spotShadowMap.length=T,n.spotLightMatrix.length=T+y-A,n.spotLightMap.length=y,n.numSpotLightShadowsWithMaps=A,n.numLightProbes=E,P.sunLength=f,P.directionalLength=p,P.pointLength=g,P.spotLength=v,P.rectAreaLength=M,P.hemiLength=x,P.numSunShadows=m,P.numDirectionalShadows=b,P.numPointShadows=S,P.numSpotShadows=T,P.numSpotMaps=y,P.numLightProbes=E,n.version=o_++)}function l(c,h){let d=0,u=0,f=0,m=0,_=0,p=0;const g=h.matrixWorldInverse;for(let v=0,M=c.length;v<M;v++){const x=c[v];if(x.isSunLight){const b=n.sun[d];b.direction.setFromMatrixPosition(x.matrixWorld),b.direction.transformDirection(g),d++}else if(x.isDirectionalLight){const b=n.directional[u];b.direction.setFromMatrixPosition(x.matrixWorld),i.setFromMatrixPosition(x.target.matrixWorld),b.direction.sub(i),b.direction.transformDirection(g),u++}else if(x.isSpotLight){const b=n.spot[m];b.position.setFromMatrixPosition(x.matrixWorld),b.position.applyMatrix4(g),b.direction.setFromMatrixPosition(x.matrixWorld),i.setFromMatrixPosition(x.target.matrixWorld),b.direction.sub(i),b.direction.transformDirection(g),m++}else if(x.isRectAreaLight){const b=n.rectArea[_];b.position.setFromMatrixPosition(x.matrixWorld),b.position.applyMatrix4(g),a.identity(),s.copy(x.matrixWorld),s.premultiply(g),a.extractRotation(s),b.halfWidth.set(x.width*.5,0,0),b.halfHeight.set(0,x.height*.5,0),b.halfWidth.applyMatrix4(a),b.halfHeight.applyMatrix4(a),_++}else if(x.isPointLight){const b=n.point[f];b.position.setFromMatrixPosition(x.matrixWorld),b.position.applyMatrix4(g),f++}else if(x.isHemisphereLight){const b=n.hemi[p];b.direction.setFromMatrixPosition(x.matrixWorld),b.direction.transformDirection(g),p++}}}return{setup:o,setupView:l,state:n}}function wf(r){const t=new c_(r),e=[],n=[],i=[];function s(u){d.camera=u,e.length=0,n.length=0,i.length=0}function a(u){e.push(u)}function o(u){n.push(u)}function l(u){i.push(u)}function c(){t.setup(e)}function h(u){t.setupView(e,u)}const d={lightsArray:e,shadowsArray:n,lightProbeGridArray:i,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:s,state:d,setupLights:c,setupLightsView:h,pushLight:a,pushShadow:o,pushLightProbeGrid:l}}function h_(r){let t=new WeakMap;function e(i,s=0){const a=t.get(i);let o;return a===void 0?(o=new wf(r),t.set(i,[o])):s>=a.length?(o=new wf(r),a.push(o)):o=a[s],o}function n(){t=new WeakMap}return{get:e,dispose:n}}const u_=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,f_=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,d_=[new L(1,0,0),new L(-1,0,0),new L(0,1,0),new L(0,-1,0),new L(0,0,1),new L(0,0,-1)],p_=[new L(0,-1,0),new L(0,-1,0),new L(0,0,1),new L(0,0,-1),new L(0,-1,0),new L(0,-1,0)],Af=new It,zr=new L,vc=new L;function m_(r,t,e){let n=new Vl;const i=new ft,s=new ft,a=new ue,o=new Tm,l=new Em,c={},h=e.maxTextureSize,d={[Mi]:nn,[nn]:Mi,[qe]:qe},u=new le({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new ft},radius:{value:4}},vertexShader:u_,fragmentShader:f_}),f=u.clone();f.defines.HORIZONTAL_PASS=1;const m=new ve;m.setAttribute("position",new Pe(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const _=new Xt(m,u),p=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=qs;let g=this.type;this.render=function(S,T,y){if(p.enabled===!1||p.autoUpdate===!1&&p.needsUpdate===!1||S.length===0)return;this.type===Md&&(Nt("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=qs);const A=r.getRenderTarget(),E=r.getActiveCubeFace(),P=r.getActiveMipmapLevel(),D=r.state;D.setBlending(Ze),D.buffers.depth.getReversed()===!0?D.buffers.color.setClear(0,0,0,0):D.buffers.color.setClear(1,1,1,1),D.buffers.depth.setTest(!0),D.setScissorTest(!1);const N=g!==this.type;N&&T.traverse(function(R){R.material&&(Array.isArray(R.material)?R.material.forEach(B=>B.needsUpdate=!0):R.material.needsUpdate=!0)});for(let R=0,B=S.length;R<B;R++){const V=S[R],Y=V.shadow;if(Y===void 0){Nt("WebGLShadowMap:",V,"has no shadow.");continue}if(Y.autoUpdate===!1&&Y.needsUpdate===!1)continue;i.copy(Y.mapSize);const it=Y.getFrameExtents();i.multiply(it),s.copy(Y.mapSize),(i.x>h||i.y>h)&&(i.x>h&&(s.x=Math.floor(h/it.x),i.x=s.x*it.x,Y.mapSize.x=s.x),i.y>h&&(s.y=Math.floor(h/it.y),i.y=s.y*it.y,Y.mapSize.y=s.y));const Z=r.state.buffers.depth.getReversed();if(Y.camera._reversedDepth=Z,Y.map===null||N===!0){if(Y.map!==null&&(Y.map.depthTexture!==null&&(Y.map.depthTexture.dispose(),Y.map.depthTexture=null),Y.map.dispose()),this.type===Zs){if(V.isPointLight){Nt("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}Y.map=new $e(i.x,i.y,{format:zi,type:Je,minFilter:Ne,magFilter:Ne,generateMipmaps:!1}),Y.map.texture.name=V.name+".shadowMap",Y.map.depthTexture=new ys(i.x,i.y,wn),Y.map.depthTexture.name=V.name+".shadowMapDepth",Y.map.depthTexture.format=li,Y.map.depthTexture.compareFunction=null,Y.map.depthTexture.minFilter=Ue,Y.map.depthTexture.magFilter=Ue}else V.isPointLight?(Y.map=new sf(i.x),Y.map.depthTexture=new Xp(i.x,qn)):(Y.map=new $e(i.x,i.y),Y.map.depthTexture=new ys(i.x,i.y,qn)),Y.map.depthTexture.name=V.name+".shadowMap",Y.map.depthTexture.format=li,this.type===qs?(Y.map.depthTexture.compareFunction=Z?dl:fl,Y.map.depthTexture.minFilter=Ne,Y.map.depthTexture.magFilter=Ne):(Y.map.depthTexture.compareFunction=null,Y.map.depthTexture.minFilter=Ue,Y.map.depthTexture.magFilter=Ue);Y.camera.updateProjectionMatrix()}Y.map.isWebGLCubeRenderTarget!==!0&&(Y.map.width!==i.x||Y.map.height!==i.y)&&Y.map.setSize(i.x,i.y);const j=Y.map.isWebGLCubeRenderTarget?6:Y.getViewportCount();V.isPointLight!==!0&&Y.updateMatrices(V,y);for(let ct=0;ct<j;ct++){const xt=Y.getCamera(ct);if(V.isPointLight){const _t=Y.camera,kt=Y.matrix,zt=V.distance||_t.far;zt!==_t.far&&(_t.far=zt,_t.updateProjectionMatrix()),zr.setFromMatrixPosition(V.matrixWorld),_t.position.copy(zr),vc.copy(_t.position),vc.add(d_[ct]),_t.up.copy(p_[ct]),_t.lookAt(vc),_t.updateMatrixWorld(),kt.makeTranslation(-zr.x,-zr.y,-zr.z),Af.multiplyMatrices(_t.projectionMatrix,_t.matrixWorldInverse),Y._frustum.setFromProjectionMatrix(Af,_t.coordinateSystem,_t.reversedDepth)}if(Y.map.isWebGLCubeRenderTarget)r.setRenderTarget(Y.map,ct),r.clear();else{ct===0&&(r.setRenderTarget(Y.map),r.clear());const _t=Y.getViewport(ct);a.set(s.x*_t.x,s.y*_t.y,s.x*_t.z,s.y*_t.w),D.viewport(a)}n=Y.getFrustum(ct),x(T,y,xt,V,this.type)}Y.isPointLightShadow!==!0&&this.type===Zs&&v(Y,y),Y.needsUpdate=!1}g=this.type,p.needsUpdate=!1,r.setRenderTarget(A,E,P)};function v(S,T){const y=t.update(_);u.defines.VSM_SAMPLES!==S.blurSamples&&(u.defines.VSM_SAMPLES=S.blurSamples,f.defines.VSM_SAMPLES=S.blurSamples,u.needsUpdate=!0,f.needsUpdate=!0),S.mapPass===null?S.mapPass=new $e(i.x,i.y,{format:zi,type:Je}):(S.mapPass.width!==S.map.width||S.mapPass.height!==S.map.height)&&S.mapPass.setSize(S.map.width,S.map.height),u.uniforms.shadow_pass.value=S.map.depthTexture,u.uniforms.resolution.value.set(S.map.width,S.map.height),u.uniforms.radius.value=S.radius,r.setRenderTarget(S.mapPass),r.clear(),r.renderBufferDirect(T,null,y,u,_,null),f.uniforms.shadow_pass.value=S.mapPass.texture,f.uniforms.resolution.value.set(S.map.width,S.map.height),f.uniforms.radius.value=S.radius,r.setRenderTarget(S.map),r.clear(),r.renderBufferDirect(T,null,y,f,_,null)}function M(S,T,y,A){let E=null;const P=y.isPointLight===!0?S.customDistanceMaterial:S.customDepthMaterial;if(P!==void 0)E=P;else if(E=y.isPointLight===!0?l:o,r.localClippingEnabled&&T.clipShadows===!0&&Array.isArray(T.clippingPlanes)&&T.clippingPlanes.length!==0||T.displacementMap&&T.displacementScale!==0||T.alphaMap&&T.alphaTest>0||T.map&&T.alphaTest>0||T.alphaToCoverage===!0){const D=E.uuid,N=T.uuid;let R=c[D];R===void 0&&(R={},c[D]=R);let B=R[N];B===void 0&&(B=E.clone(),R[N]=B,T.addEventListener("dispose",b)),E=B}if(E.visible=T.visible,E.wireframe=T.wireframe,A===Zs?E.side=T.shadowSide!==null?T.shadowSide:T.side:E.side=T.shadowSide!==null?T.shadowSide:d[T.side],E.alphaMap=T.alphaMap,E.alphaTest=T.alphaToCoverage===!0?.5:T.alphaTest,E.map=T.map,E.clipShadows=T.clipShadows,E.clippingPlanes=T.clippingPlanes,E.clipIntersection=T.clipIntersection,E.displacementMap=T.displacementMap,E.displacementScale=T.displacementScale,E.displacementBias=T.displacementBias,E.wireframeLinewidth=T.wireframeLinewidth,E.linewidth=T.linewidth,y.isPointLight===!0&&E.isMeshDistanceMaterial===!0){const D=r.properties.get(E);D.light=y}return E}function x(S,T,y,A,E){if(S.visible===!1)return;if(S.layers.test(T.layers)&&(S.isMesh||S.isLine||S.isPoints)&&(S.castShadow||S.receiveShadow&&E===Zs)&&(!S.frustumCulled||S.intersectsFrustum(n))){S.modelViewMatrix.multiplyMatrices(y.matrixWorldInverse,S.matrixWorld);const N=t.update(S),R=S.material;if(Array.isArray(R)){const B=N.groups;for(let V=0,Y=B.length;V<Y;V++){const it=B[V],Z=R[it.materialIndex];if(Z&&Z.visible){const j=M(S,Z,A,E);S.onBeforeShadow(r,S,T,y,N,j,it),r.renderBufferDirect(y,null,N,j,S,it),S.onAfterShadow(r,S,T,y,N,j,it)}}}else if(R.visible){const B=M(S,R,A,E);S.onBeforeShadow(r,S,T,y,N,B,null),r.renderBufferDirect(y,null,N,B,S,null),S.onAfterShadow(r,S,T,y,N,B,null)}}const D=S.children;for(let N=0,R=D.length;N<R;N++)x(D[N],T,y,A,E)}function b(S){S.target.removeEventListener("dispose",b);for(const y in c){const A=c[y],E=S.target.uuid;E in A&&(A[E].dispose(),delete A[E])}}}function g_(r,t){function e(){let I=!1;const lt=new ue;let J=null;const gt=new ue(0,0,0,0);return{setMask:function(vt){J!==vt&&!I&&(r.colorMask(vt,vt,vt,vt),J=vt)},setLocked:function(vt){I=vt},setClear:function(vt,ut,St,wt,de){de===!0&&(vt*=wt,ut*=wt,St*=wt),lt.set(vt,ut,St,wt),gt.equals(lt)===!1&&(r.clearColor(vt,ut,St,wt),gt.copy(lt))},reset:function(){I=!1,J=null,gt.set(-1,0,0,0)}}}function n(){let I=!1,lt=!1,J=null,gt=null,vt=null;return{setReversed:function(ut){if(lt!==ut){const St=t.get("EXT_clip_control");ut?St.clipControlEXT(St.LOWER_LEFT_EXT,St.ZERO_TO_ONE_EXT):St.clipControlEXT(St.LOWER_LEFT_EXT,St.NEGATIVE_ONE_TO_ONE_EXT),lt=ut;const wt=vt;vt=null,this.setClear(wt)}},getReversed:function(){return lt},setTest:function(ut){ut?rt(r.DEPTH_TEST):Mt(r.DEPTH_TEST)},setMask:function(ut){J!==ut&&!I&&(r.depthMask(ut),J=ut)},setFunc:function(ut){if(lt&&(ut=Qd[ut]),gt!==ut){switch(ut){case uo:r.depthFunc(r.NEVER);break;case fo:r.depthFunc(r.ALWAYS);break;case po:r.depthFunc(r.LESS);break;case Ks:r.depthFunc(r.LEQUAL);break;case mo:r.depthFunc(r.EQUAL);break;case go:r.depthFunc(r.GEQUAL);break;case xo:r.depthFunc(r.GREATER);break;case vo:r.depthFunc(r.NOTEQUAL);break;default:r.depthFunc(r.LEQUAL)}gt=ut}},setLocked:function(ut){I=ut},setClear:function(ut){vt!==ut&&(vt=ut,lt&&(ut=1-ut),r.clearDepth(ut))},reset:function(){I=!1,J=null,gt=null,vt=null,lt=!1}}}function i(){let I=!1,lt=null,J=null,gt=null,vt=null,ut=null,St=null,wt=null,de=null;return{setTest:function(oe){I||(oe?rt(r.STENCIL_TEST):Mt(r.STENCIL_TEST))},setMask:function(oe){lt!==oe&&!I&&(r.stencilMask(oe),lt=oe)},setFunc:function(oe,pn,mn){(J!==oe||gt!==pn||vt!==mn)&&(r.stencilFunc(oe,pn,mn),J=oe,gt=pn,vt=mn)},setOp:function(oe,pn,mn){(ut!==oe||St!==pn||wt!==mn)&&(r.stencilOp(oe,pn,mn),ut=oe,St=pn,wt=mn)},setLocked:function(oe){I=oe},setClear:function(oe){de!==oe&&(r.clearStencil(oe),de=oe)},reset:function(){I=!1,lt=null,J=null,gt=null,vt=null,ut=null,St=null,wt=null,de=null}}}const s=new e,a=new n,o=new i,l=new WeakMap,c=new WeakMap;let h={},d={},u={},f=new WeakMap,m=[],_=null,p=!1,g=null,v=null,M=null,x=null,b=null,S=null,T=null,y=new pt(0,0,0),A=0,E=!1,P=null,D=null,N=null,R=null,B=null;const V=r.getParameter(r.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let Y=!1,it=0;const Z=r.getParameter(r.VERSION);Z.indexOf("WebGL")!==-1?(it=parseFloat(/^WebGL (\d)/.exec(Z)[1]),Y=it>=1):Z.indexOf("OpenGL ES")!==-1&&(it=parseFloat(/^OpenGL ES (\d)/.exec(Z)[1]),Y=it>=2);let j=null,ct={};const xt=r.getParameter(r.SCISSOR_BOX),_t=r.getParameter(r.VIEWPORT),kt=new ue().fromArray(xt),zt=new ue().fromArray(_t);function Dt(I,lt,J,gt){const vt=new Uint8Array(4),ut=r.createTexture();r.bindTexture(I,ut),r.texParameteri(I,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(I,r.TEXTURE_MAG_FILTER,r.NEAREST);for(let St=0;St<J;St++)I===r.TEXTURE_3D||I===r.TEXTURE_2D_ARRAY?r.texImage3D(lt,0,r.RGBA,1,1,gt,0,r.RGBA,r.UNSIGNED_BYTE,vt):r.texImage2D(lt+St,0,r.RGBA,1,1,0,r.RGBA,r.UNSIGNED_BYTE,vt);return ut}const st={};st[r.TEXTURE_2D]=Dt(r.TEXTURE_2D,r.TEXTURE_2D,1),st[r.TEXTURE_CUBE_MAP]=Dt(r.TEXTURE_CUBE_MAP,r.TEXTURE_CUBE_MAP_POSITIVE_X,6),st[r.TEXTURE_2D_ARRAY]=Dt(r.TEXTURE_2D_ARRAY,r.TEXTURE_2D_ARRAY,1,1),st[r.TEXTURE_3D]=Dt(r.TEXTURE_3D,r.TEXTURE_3D,1,1),s.setClear(0,0,0,1),a.setClear(1),o.setClear(0),rt(r.DEPTH_TEST),a.setFunc(Ks),Ht(!1),ee(Qc),rt(r.CULL_FACE),Vt(Ze);function rt(I){h[I]!==!0&&(r.enable(I),h[I]=!0)}function Mt(I){h[I]!==!1&&(r.disable(I),h[I]=!1)}function Lt(I,lt){return u[I]!==lt?(r.bindFramebuffer(I,lt),u[I]=lt,I===r.DRAW_FRAMEBUFFER&&(u[r.FRAMEBUFFER]=lt),I===r.FRAMEBUFFER&&(u[r.DRAW_FRAMEBUFFER]=lt),!0):!1}function yt(I,lt){let J=m,gt=!1;if(I){J=f.get(lt),J===void 0&&(J=[],f.set(lt,J));const vt=I.textures;if(J.length!==vt.length||J[0]!==r.COLOR_ATTACHMENT0){for(let ut=0,St=vt.length;ut<St;ut++)J[ut]=r.COLOR_ATTACHMENT0+ut;J.length=vt.length,gt=!0}}else J[0]!==r.BACK&&(J[0]=r.BACK,gt=!0);gt&&r.drawBuffers(J)}function Bt(I){return _!==I?(r.useProgram(I),_=I,!0):!1}const _e={[Xn]:r.FUNC_ADD,[yd]:r.FUNC_SUBTRACT,[Sd]:r.FUNC_REVERSE_SUBTRACT};_e[bd]=r.MIN,_e[wd]=r.MAX;const Gt={[$s]:r.ZERO,[Ad]:r.ONE,[Td]:r.SRC_COLOR,[ih]:r.SRC_ALPHA,[Pd]:r.SRC_ALPHA_SATURATE,[ho]:r.DST_COLOR,[co]:r.DST_ALPHA,[Ed]:r.ONE_MINUS_SRC_COLOR,[sh]:r.ONE_MINUS_SRC_ALPHA,[Rd]:r.ONE_MINUS_DST_COLOR,[Cd]:r.ONE_MINUS_DST_ALPHA,[Id]:r.CONSTANT_COLOR,[Ld]:r.ONE_MINUS_CONSTANT_COLOR,[Dd]:r.CONSTANT_ALPHA,[Ud]:r.ONE_MINUS_CONSTANT_ALPHA};function Vt(I,lt,J,gt,vt,ut,St,wt,de,oe){if(I===Ze){p===!0&&(Mt(r.BLEND),p=!1);return}if(p===!1&&(rt(r.BLEND),p=!0),I!==nh){if(I!==g||oe!==E){if((v!==Xn||b!==Xn)&&(r.blendEquation(r.FUNC_ADD),v=Xn,b=Xn),oe)switch(I){case ji:r.blendFuncSeparate(r.ONE,r.ONE_MINUS_SRC_ALPHA,r.ONE,r.ONE_MINUS_SRC_ALPHA);break;case Fn:r.blendFunc(r.ONE,r.ONE);break;case th:r.blendFuncSeparate(r.ZERO,r.ONE_MINUS_SRC_COLOR,r.ZERO,r.ONE);break;case eh:r.blendFuncSeparate(r.DST_COLOR,r.ONE_MINUS_SRC_ALPHA,r.ZERO,r.ONE);break;default:Ot("WebGLState: Invalid blending: ",I);break}else switch(I){case ji:r.blendFuncSeparate(r.SRC_ALPHA,r.ONE_MINUS_SRC_ALPHA,r.ONE,r.ONE_MINUS_SRC_ALPHA);break;case Fn:r.blendFuncSeparate(r.SRC_ALPHA,r.ONE,r.ONE,r.ONE);break;case th:Ot("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case eh:Ot("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Ot("WebGLState: Invalid blending: ",I);break}M=null,x=null,S=null,T=null,y.set(0,0,0),A=0,g=I,E=oe}return}vt=vt||lt,ut=ut||J,St=St||gt,(lt!==v||vt!==b)&&(r.blendEquationSeparate(_e[lt],_e[vt]),v=lt,b=vt),(J!==M||gt!==x||ut!==S||St!==T)&&(r.blendFuncSeparate(Gt[J],Gt[gt],Gt[ut],Gt[St]),M=J,x=gt,S=ut,T=St),(wt.equals(y)===!1||de!==A)&&(r.blendColor(wt.r,wt.g,wt.b,de),y.copy(wt),A=de),g=I,E=!1}function Kt(I,lt){I.side===qe?Mt(r.CULL_FACE):rt(r.CULL_FACE);let J=I.side===nn;lt&&(J=!J),Ht(J),I.blending===ji&&I.transparent===!1?Vt(Ze):Vt(I.blending,I.blendEquation,I.blendSrc,I.blendDst,I.blendEquationAlpha,I.blendSrcAlpha,I.blendDstAlpha,I.blendColor,I.blendAlpha,I.premultipliedAlpha),a.setFunc(I.depthFunc),a.setTest(I.depthTest),a.setMask(I.depthWrite),s.setMask(I.colorWrite);const gt=I.stencilWrite;o.setTest(gt),gt&&(o.setMask(I.stencilWriteMask),o.setFunc(I.stencilFunc,I.stencilRef,I.stencilFuncMask),o.setOp(I.stencilFail,I.stencilZFail,I.stencilZPass)),Le(I.polygonOffset,I.polygonOffsetFactor,I.polygonOffsetUnits),I.alphaToCoverage===!0?rt(r.SAMPLE_ALPHA_TO_COVERAGE):Mt(r.SAMPLE_ALPHA_TO_COVERAGE)}function Ht(I){P!==I&&(I?r.frontFace(r.CW):r.frontFace(r.CCW),P=I)}function ee(I){I!==vd?(rt(r.CULL_FACE),I!==D&&(I===Qc?r.cullFace(r.BACK):I===_d?r.cullFace(r.FRONT):r.cullFace(r.FRONT_AND_BACK))):Mt(r.CULL_FACE),D=I}function fe(I){I!==N&&(Y&&r.lineWidth(I),N=I)}function Le(I,lt,J){I?(rt(r.POLYGON_OFFSET_FILL),(R!==lt||B!==J)&&(R=lt,B=J,a.getReversed()&&(lt=-lt),r.polygonOffset(lt,J))):Mt(r.POLYGON_OFFSET_FILL)}function jt(I){I?rt(r.SCISSOR_TEST):Mt(r.SCISSOR_TEST)}function se(I){I===void 0&&(I=r.TEXTURE0+V-1),j!==I&&(r.activeTexture(I),j=I)}function H(I,lt,J){J===void 0&&(j===null?J=r.TEXTURE0+V-1:J=j);let gt=ct[J];gt===void 0&&(gt={type:void 0,texture:void 0},ct[J]=gt),(gt.type!==I||gt.texture!==lt)&&(j!==J&&(r.activeTexture(J),j=J),r.bindTexture(I,lt||st[I]),gt.type=I,gt.texture=lt)}function Ce(){const I=ct[j];I!==void 0&&I.type!==void 0&&(r.bindTexture(I.type,null),I.type=void 0,I.texture=void 0)}function Yt(){try{r.compressedTexImage2D(...arguments)}catch(I){Ot("WebGLState:",I)}}function U(){try{r.compressedTexImage3D(...arguments)}catch(I){Ot("WebGLState:",I)}}function w(){try{r.texSubImage2D(...arguments)}catch(I){Ot("WebGLState:",I)}}function q(){try{r.texSubImage3D(...arguments)}catch(I){Ot("WebGLState:",I)}}function K(){try{r.compressedTexSubImage2D(...arguments)}catch(I){Ot("WebGLState:",I)}}function ot(){try{r.compressedTexSubImage3D(...arguments)}catch(I){Ot("WebGLState:",I)}}function k(){try{r.texStorage2D(...arguments)}catch(I){Ot("WebGLState:",I)}}function $(){try{r.texStorage3D(...arguments)}catch(I){Ot("WebGLState:",I)}}function X(){try{r.texImage2D(...arguments)}catch(I){Ot("WebGLState:",I)}}function nt(){try{r.texImage3D(...arguments)}catch(I){Ot("WebGLState:",I)}}function mt(I){return d[I]!==void 0?d[I]:r.getParameter(I)}function z(I,lt){d[I]!==lt&&(r.pixelStorei(I,lt),d[I]=lt)}function O(I){kt.equals(I)===!1&&(r.scissor(I.x,I.y,I.z,I.w),kt.copy(I))}function W(I){zt.equals(I)===!1&&(r.viewport(I.x,I.y,I.z,I.w),zt.copy(I))}function Q(I,lt){let J=c.get(lt);J===void 0&&(J=new WeakMap,c.set(lt,J));let gt=J.get(I);gt===void 0&&(gt=r.getUniformBlockIndex(lt,I.name),J.set(I,gt))}function dt(I,lt){const gt=c.get(lt).get(I);l.get(lt)!==gt&&(r.uniformBlockBinding(lt,gt,I.__bindingPointIndex),l.set(lt,gt))}function ht(){r.disable(r.BLEND),r.disable(r.CULL_FACE),r.disable(r.DEPTH_TEST),r.disable(r.POLYGON_OFFSET_FILL),r.disable(r.SCISSOR_TEST),r.disable(r.STENCIL_TEST),r.disable(r.SAMPLE_ALPHA_TO_COVERAGE),r.blendEquation(r.FUNC_ADD),r.blendFunc(r.ONE,r.ZERO),r.blendFuncSeparate(r.ONE,r.ZERO,r.ONE,r.ZERO),r.blendColor(0,0,0,0),r.colorMask(!0,!0,!0,!0),r.clearColor(0,0,0,0),r.depthMask(!0),r.depthFunc(r.LESS),a.setReversed(!1),r.clearDepth(1),r.stencilMask(4294967295),r.stencilFunc(r.ALWAYS,0,4294967295),r.stencilOp(r.KEEP,r.KEEP,r.KEEP),r.clearStencil(0),r.cullFace(r.BACK),r.frontFace(r.CCW),r.polygonOffset(0,0),r.activeTexture(r.TEXTURE0),r.bindFramebuffer(r.FRAMEBUFFER,null),r.bindFramebuffer(r.DRAW_FRAMEBUFFER,null),r.bindFramebuffer(r.READ_FRAMEBUFFER,null),r.useProgram(null),r.lineWidth(1),r.scissor(0,0,r.canvas.width,r.canvas.height),r.viewport(0,0,r.canvas.width,r.canvas.height),r.pixelStorei(r.PACK_ALIGNMENT,4),r.pixelStorei(r.UNPACK_ALIGNMENT,4),r.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,!1),r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),r.pixelStorei(r.UNPACK_COLORSPACE_CONVERSION_WEBGL,r.BROWSER_DEFAULT_WEBGL),r.pixelStorei(r.PACK_ROW_LENGTH,0),r.pixelStorei(r.PACK_SKIP_PIXELS,0),r.pixelStorei(r.PACK_SKIP_ROWS,0),r.pixelStorei(r.UNPACK_ROW_LENGTH,0),r.pixelStorei(r.UNPACK_IMAGE_HEIGHT,0),r.pixelStorei(r.UNPACK_SKIP_PIXELS,0),r.pixelStorei(r.UNPACK_SKIP_ROWS,0),r.pixelStorei(r.UNPACK_SKIP_IMAGES,0),h={},d={},j=null,ct={},u={},f=new WeakMap,m=[],_=null,p=!1,g=null,v=null,M=null,x=null,b=null,S=null,T=null,y=new pt(0,0,0),A=0,E=!1,P=null,D=null,N=null,R=null,B=null,kt.set(0,0,r.canvas.width,r.canvas.height),zt.set(0,0,r.canvas.width,r.canvas.height),s.reset(),a.reset(),o.reset()}return{buffers:{color:s,depth:a,stencil:o},enable:rt,disable:Mt,bindFramebuffer:Lt,drawBuffers:yt,useProgram:Bt,setBlending:Vt,setMaterial:Kt,setFlipSided:Ht,setCullFace:ee,setLineWidth:fe,setPolygonOffset:Le,setScissorTest:jt,activeTexture:se,bindTexture:H,unbindTexture:Ce,compressedTexImage2D:Yt,compressedTexImage3D:U,texImage2D:X,texImage3D:nt,pixelStorei:z,getParameter:mt,updateUBOMapping:Q,uniformBlockBinding:dt,texStorage2D:k,texStorage3D:$,texSubImage2D:w,texSubImage3D:q,compressedTexSubImage2D:K,compressedTexSubImage3D:ot,scissor:O,viewport:W,reset:ht}}function x_(r,t,e,n,i,s,a){const o=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new ft,h=new WeakMap,d=new Set;let u;const f=new WeakMap;let m=!1;try{m=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function _(U,w){return m?new OffscreenCanvas(U,w):ir("canvas")}function p(U,w,q){let K=1;const ot=Yt(U);if((ot.width>q||ot.height>q)&&(K=q/Math.max(ot.width,ot.height)),K<1)if(typeof HTMLImageElement<"u"&&U instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&U instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&U instanceof ImageBitmap||typeof VideoFrame<"u"&&U instanceof VideoFrame){const k=Math.floor(K*ot.width),$=Math.floor(K*ot.height);u===void 0&&(u=_(k,$));const X=w?_(k,$):u;return X.width=k,X.height=$,X.getContext("2d").drawImage(U,0,0,k,$),Nt("WebGLRenderer: Texture has been resized from ("+ot.width+"x"+ot.height+") to ("+k+"x"+$+")."),X}else return"data"in U&&Nt("WebGLRenderer: Image in DataTexture is too big ("+ot.width+"x"+ot.height+")."),U;return U}function g(U){return U.generateMipmaps}function v(U){r.generateMipmap(U)}function M(U){return U.isWebGLCubeRenderTarget?r.TEXTURE_CUBE_MAP:U.isWebGL3DRenderTarget?r.TEXTURE_3D:U.isWebGLArrayRenderTarget||U.isCompressedArrayTexture?r.TEXTURE_2D_ARRAY:r.TEXTURE_2D}function x(U,w,q,K,ot,k=!1){if(U!==null){if(r[U]!==void 0)return r[U];Nt("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+U+"'")}let $;K&&($=t.get("EXT_texture_norm16"),$||Nt("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let X=w;if(w===r.RED&&(q===r.FLOAT&&(X=r.R32F),q===r.HALF_FLOAT&&(X=r.R16F),q===r.UNSIGNED_BYTE&&(X=r.R8),q===r.UNSIGNED_SHORT&&$&&(X=$.R16_EXT),q===r.SHORT&&$&&(X=$.R16_SNORM_EXT)),w===r.RED_INTEGER&&(q===r.UNSIGNED_BYTE&&(X=r.R8UI),q===r.UNSIGNED_SHORT&&(X=r.R16UI),q===r.UNSIGNED_INT&&(X=r.R32UI),q===r.BYTE&&(X=r.R8I),q===r.SHORT&&(X=r.R16I),q===r.INT&&(X=r.R32I)),w===r.RG&&(q===r.FLOAT&&(X=r.RG32F),q===r.HALF_FLOAT&&(X=r.RG16F),q===r.UNSIGNED_BYTE&&(X=r.RG8),q===r.UNSIGNED_SHORT&&$&&(X=$.RG16_EXT),q===r.SHORT&&$&&(X=$.RG16_SNORM_EXT)),w===r.RG_INTEGER&&(q===r.UNSIGNED_BYTE&&(X=r.RG8UI),q===r.UNSIGNED_SHORT&&(X=r.RG16UI),q===r.UNSIGNED_INT&&(X=r.RG32UI),q===r.BYTE&&(X=r.RG8I),q===r.SHORT&&(X=r.RG16I),q===r.INT&&(X=r.RG32I)),w===r.RGB_INTEGER&&(q===r.UNSIGNED_BYTE&&(X=r.RGB8UI),q===r.UNSIGNED_SHORT&&(X=r.RGB16UI),q===r.UNSIGNED_INT&&(X=r.RGB32UI),q===r.BYTE&&(X=r.RGB8I),q===r.SHORT&&(X=r.RGB16I),q===r.INT&&(X=r.RGB32I)),w===r.RGBA_INTEGER&&(q===r.UNSIGNED_BYTE&&(X=r.RGBA8UI),q===r.UNSIGNED_SHORT&&(X=r.RGBA16UI),q===r.UNSIGNED_INT&&(X=r.RGBA32UI),q===r.BYTE&&(X=r.RGBA8I),q===r.SHORT&&(X=r.RGBA16I),q===r.INT&&(X=r.RGBA32I)),w===r.RGB&&(q===r.UNSIGNED_SHORT&&$&&(X=$.RGB16_EXT),q===r.SHORT&&$&&(X=$.RGB16_SNORM_EXT),q===r.UNSIGNED_INT_5_9_9_9_REV&&(X=r.RGB9_E5),q===r.UNSIGNED_INT_10F_11F_11F_REV&&(X=r.R11F_G11F_B10F)),w===r.RGBA){const nt=k?na:Qt.getTransfer(ot);q===r.FLOAT&&(X=r.RGBA32F),q===r.HALF_FLOAT&&(X=r.RGBA16F),q===r.UNSIGNED_BYTE&&(X=nt===he?r.SRGB8_ALPHA8:r.RGBA8),q===r.UNSIGNED_SHORT&&$&&(X=$.RGBA16_EXT),q===r.SHORT&&$&&(X=$.RGBA16_SNORM_EXT),q===r.UNSIGNED_SHORT_4_4_4_4&&(X=r.RGBA4),q===r.UNSIGNED_SHORT_5_5_5_1&&(X=r.RGB5_A1)}return(X===r.R16F||X===r.R32F||X===r.RG16F||X===r.RG32F||X===r.RGBA16F||X===r.RGBA32F)&&t.get("EXT_color_buffer_float"),X}function b(U,w){let q;return U?w===null||w===qn||w===ts?q=r.DEPTH24_STENCIL8:w===wn?q=r.DEPTH32F_STENCIL8:w===js&&(q=r.DEPTH24_STENCIL8,Nt("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):w===null||w===qn||w===ts?q=r.DEPTH_COMPONENT24:w===wn?q=r.DEPTH_COMPONENT32F:w===js&&(q=r.DEPTH_COMPONENT16),q}function S(U,w){return g(U)===!0||U.isFramebufferTexture&&U.minFilter!==Ue&&U.minFilter!==Ne?Math.log2(Math.max(w.width,w.height))+1:U.mipmaps!==void 0&&U.mipmaps.length>0?U.mipmaps.length:U.isCompressedTexture&&Array.isArray(U.image)?w.mipmaps.length:1}function T(U){const w=U.target;w.removeEventListener("dispose",T),A(w),w.isVideoTexture&&h.delete(w),w.isHTMLTexture&&d.delete(w)}function y(U){const w=U.target;w.removeEventListener("dispose",y),P(w)}function A(U){const w=n.get(U);if(w.__webglInit===void 0)return;const q=U.source,K=f.get(q);if(K){const ot=K[w.__cacheKey];ot.usedTimes--,ot.usedTimes===0&&E(U),Object.keys(K).length===0&&f.delete(q)}n.remove(U)}function E(U){const w=n.get(U);r.deleteTexture(w.__webglTexture);const q=U.source,K=f.get(q);delete K[w.__cacheKey],a.memory.textures--}function P(U){const w=n.get(U);if(U.depthTexture&&(U.depthTexture.dispose(),n.remove(U.depthTexture)),U.isWebGLCubeRenderTarget)for(let K=0;K<6;K++){if(Array.isArray(w.__webglFramebuffer[K]))for(let ot=0;ot<w.__webglFramebuffer[K].length;ot++)r.deleteFramebuffer(w.__webglFramebuffer[K][ot]);else r.deleteFramebuffer(w.__webglFramebuffer[K]);w.__webglDepthbuffer&&r.deleteRenderbuffer(w.__webglDepthbuffer[K])}else{if(Array.isArray(w.__webglFramebuffer))for(let K=0;K<w.__webglFramebuffer.length;K++)r.deleteFramebuffer(w.__webglFramebuffer[K]);else r.deleteFramebuffer(w.__webglFramebuffer);if(w.__webglDepthbuffer&&r.deleteRenderbuffer(w.__webglDepthbuffer),w.__webglMultisampledFramebuffer&&r.deleteFramebuffer(w.__webglMultisampledFramebuffer),w.__webglColorRenderbuffer)for(let K=0;K<w.__webglColorRenderbuffer.length;K++)w.__webglColorRenderbuffer[K]&&r.deleteRenderbuffer(w.__webglColorRenderbuffer[K]);w.__webglDepthRenderbuffer&&r.deleteRenderbuffer(w.__webglDepthRenderbuffer)}const q=U.textures;for(let K=0,ot=q.length;K<ot;K++){const k=n.get(q[K]);k.__webglTexture&&(r.deleteTexture(k.__webglTexture),a.memory.textures--),n.remove(q[K])}n.remove(U)}let D=0;function N(){D=0}function R(){return D}function B(U){D=U}function V(){const U=D;return U>=i.maxTextures&&Nt("WebGLTextures: Trying to use "+(U+1)+" texture units while this GPU supports only "+i.maxTextures),D+=1,U}function Y(U){const w=[];return w.push(U.wrapS),w.push(U.wrapT),w.push(U.wrapR||0),w.push(U.magFilter),w.push(U.minFilter),w.push(U.anisotropy),w.push(U.internalFormat),w.push(U.format),w.push(U.type),w.push(U.generateMipmaps),w.push(U.premultiplyAlpha),w.push(U.flipY),w.push(U.unpackAlignment),w.push(U.colorSpace),w.join()}function it(U,w){const q=n.get(U);if(U.isVideoTexture&&H(U),U.isRenderTargetTexture===!1&&U.isExternalTexture!==!0&&U.version>0&&q.__version!==U.version){const K=U.image;if(K===null)Nt("WebGLRenderer: Texture marked for update but no image data found.");else if(K.complete===!1)Nt("WebGLRenderer: Texture marked for update but image is incomplete");else{Mt(q,U,w);return}}else U.isExternalTexture&&(q.__webglTexture=U.sourceTexture?U.sourceTexture:null);e.bindTexture(r.TEXTURE_2D,q.__webglTexture,r.TEXTURE0+w)}function Z(U,w){const q=n.get(U);if(U.isRenderTargetTexture===!1&&U.version>0&&q.__version!==U.version){Mt(q,U,w);return}else U.isExternalTexture&&(q.__webglTexture=U.sourceTexture?U.sourceTexture:null);e.bindTexture(r.TEXTURE_2D_ARRAY,q.__webglTexture,r.TEXTURE0+w)}function j(U,w){const q=n.get(U);if(U.isRenderTargetTexture===!1&&U.version>0&&q.__version!==U.version){Mt(q,U,w);return}e.bindTexture(r.TEXTURE_3D,q.__webglTexture,r.TEXTURE0+w)}function ct(U,w){const q=n.get(U);if(U.isCubeDepthTexture!==!0&&U.version>0&&q.__version!==U.version){Lt(q,U,w);return}e.bindTexture(r.TEXTURE_CUBE_MAP,q.__webglTexture,r.TEXTURE0+w)}const xt={[hn]:r.REPEAT,[bn]:r.CLAMP_TO_EDGE,[qr]:r.MIRRORED_REPEAT},_t={[Ue]:r.NEAREST,[oh]:r.NEAREST_MIPMAP_NEAREST,[Js]:r.NEAREST_MIPMAP_LINEAR,[Ne]:r.LINEAR,[Zr]:r.LINEAR_MIPMAP_NEAREST,[oi]:r.LINEAR_MIPMAP_LINEAR},kt={[Gd]:r.NEVER,[Zd]:r.ALWAYS,[Wd]:r.LESS,[fl]:r.LEQUAL,[Xd]:r.EQUAL,[dl]:r.GEQUAL,[Yd]:r.GREATER,[qd]:r.NOTEQUAL};function zt(U,w){if(w.type===wn&&t.has("OES_texture_float_linear")===!1&&(w.magFilter===Ne||w.magFilter===Zr||w.magFilter===Js||w.magFilter===oi||w.minFilter===Ne||w.minFilter===Zr||w.minFilter===Js||w.minFilter===oi)&&Nt("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),r.texParameteri(U,r.TEXTURE_WRAP_S,xt[w.wrapS]),r.texParameteri(U,r.TEXTURE_WRAP_T,xt[w.wrapT]),(U===r.TEXTURE_3D||U===r.TEXTURE_2D_ARRAY)&&r.texParameteri(U,r.TEXTURE_WRAP_R,xt[w.wrapR]),r.texParameteri(U,r.TEXTURE_MAG_FILTER,_t[w.magFilter]),r.texParameteri(U,r.TEXTURE_MIN_FILTER,_t[w.minFilter]),w.compareFunction&&(r.texParameteri(U,r.TEXTURE_COMPARE_MODE,r.COMPARE_REF_TO_TEXTURE),r.texParameteri(U,r.TEXTURE_COMPARE_FUNC,kt[w.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(w.magFilter===Ue||w.minFilter!==Js&&w.minFilter!==oi||w.type===wn&&t.has("OES_texture_float_linear")===!1)return;if(w.anisotropy>1||n.get(w).__currentAnisotropy){const q=t.get("EXT_texture_filter_anisotropic");r.texParameterf(U,q.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(w.anisotropy,i.getMaxAnisotropy())),n.get(w).__currentAnisotropy=w.anisotropy}}}function Dt(U,w){let q=!1;U.__webglInit===void 0&&(U.__webglInit=!0,w.addEventListener("dispose",T));const K=w.source;let ot=f.get(K);ot===void 0&&(ot={},f.set(K,ot));const k=Y(w);if(k!==U.__cacheKey){ot[k]===void 0&&(ot[k]={texture:r.createTexture(),usedTimes:0},a.memory.textures++,q=!0),ot[k].usedTimes++;const $=ot[U.__cacheKey];$!==void 0&&(ot[U.__cacheKey].usedTimes--,$.usedTimes===0&&E(w)),U.__cacheKey=k,U.__webglTexture=ot[k].texture}return q}function st(U,w,q){return Math.floor(Math.floor(U/q)/w)}function rt(U,w,q,K){const k=U.updateRanges;if(k.length===0)e.texSubImage2D(r.TEXTURE_2D,0,0,0,w.width,w.height,q,K,w.data);else{k.sort((z,O)=>z.start-O.start);let $=0;for(let z=1;z<k.length;z++){const O=k[$],W=k[z],Q=O.start+O.count,dt=st(W.start,w.width,4),ht=st(O.start,w.width,4);W.start<=Q+1&&dt===ht&&st(W.start+W.count-1,w.width,4)===dt?O.count=Math.max(O.count,W.start+W.count-O.start):(++$,k[$]=W)}k.length=$+1;const X=e.getParameter(r.UNPACK_ROW_LENGTH),nt=e.getParameter(r.UNPACK_SKIP_PIXELS),mt=e.getParameter(r.UNPACK_SKIP_ROWS);e.pixelStorei(r.UNPACK_ROW_LENGTH,w.width);for(let z=0,O=k.length;z<O;z++){const W=k[z],Q=Math.floor(W.start/4),dt=Math.ceil(W.count/4),ht=Q%w.width,I=Math.floor(Q/w.width),lt=dt,J=1;e.pixelStorei(r.UNPACK_SKIP_PIXELS,ht),e.pixelStorei(r.UNPACK_SKIP_ROWS,I),e.texSubImage2D(r.TEXTURE_2D,0,ht,I,lt,J,q,K,w.data)}U.clearUpdateRanges(),e.pixelStorei(r.UNPACK_ROW_LENGTH,X),e.pixelStorei(r.UNPACK_SKIP_PIXELS,nt),e.pixelStorei(r.UNPACK_SKIP_ROWS,mt)}}function Mt(U,w,q){let K=r.TEXTURE_2D;(w.isDataArrayTexture||w.isCompressedArrayTexture)&&(K=r.TEXTURE_2D_ARRAY),w.isData3DTexture&&(K=r.TEXTURE_3D);const ot=Dt(U,w),k=w.source;e.bindTexture(K,U.__webglTexture,r.TEXTURE0+q);const $=n.get(k);if(k.version!==$.__version||ot===!0){if(e.activeTexture(r.TEXTURE0+q),(typeof ImageBitmap<"u"&&w.image instanceof ImageBitmap)===!1){const J=Qt.getPrimaries(Qt.workingColorSpace),gt=w.colorSpace===ci?null:Qt.getPrimaries(w.colorSpace),vt=w.colorSpace===ci||J===gt?r.NONE:r.BROWSER_DEFAULT_WEBGL;e.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,w.flipY),e.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL,w.premultiplyAlpha),e.pixelStorei(r.UNPACK_COLORSPACE_CONVERSION_WEBGL,vt)}e.pixelStorei(r.UNPACK_ALIGNMENT,w.unpackAlignment);let nt=p(w.image,!1,i.maxTextureSize);nt=Ce(w,nt);const mt=s.convert(w.format,w.colorSpace),z=s.convert(w.type);let O=x(w.internalFormat,mt,z,w.normalized,w.colorSpace,w.isVideoTexture);zt(K,w);let W;const Q=w.mipmaps,dt=w.isVideoTexture!==!0,ht=$.__version===void 0||ot===!0,I=k.dataReady,lt=S(w,nt);if(w.isDepthTexture)O=b(w.format===yi,w.type),ht&&(dt?e.texStorage2D(r.TEXTURE_2D,1,O,nt.width,nt.height):e.texImage2D(r.TEXTURE_2D,0,O,nt.width,nt.height,0,mt,z,null));else if(w.isDataTexture)if(Q.length>0){dt&&ht&&e.texStorage2D(r.TEXTURE_2D,lt,O,Q[0].width,Q[0].height);for(let J=0,gt=Q.length;J<gt;J++)W=Q[J],dt?I&&e.texSubImage2D(r.TEXTURE_2D,J,0,0,W.width,W.height,mt,z,W.data):e.texImage2D(r.TEXTURE_2D,J,O,W.width,W.height,0,mt,z,W.data);w.generateMipmaps=!1}else dt?(ht&&e.texStorage2D(r.TEXTURE_2D,lt,O,nt.width,nt.height),I&&rt(w,nt,mt,z)):e.texImage2D(r.TEXTURE_2D,0,O,nt.width,nt.height,0,mt,z,nt.data);else if(w.isCompressedTexture)if(w.isCompressedArrayTexture){dt&&ht&&e.texStorage3D(r.TEXTURE_2D_ARRAY,lt,O,Q[0].width,Q[0].height,nt.depth);for(let J=0,gt=Q.length;J<gt;J++)if(W=Q[J],w.format!==gn)if(mt!==null)if(dt){if(I)if(w.layerUpdates.size>0){const vt=$u(W.width,W.height,w.format,w.type);for(const ut of w.layerUpdates){const St=W.data.subarray(ut*vt/W.data.BYTES_PER_ELEMENT,(ut+1)*vt/W.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(r.TEXTURE_2D_ARRAY,J,0,0,ut,W.width,W.height,1,mt,St)}}else e.compressedTexSubImage3D(r.TEXTURE_2D_ARRAY,J,0,0,0,W.width,W.height,nt.depth,mt,W.data)}else e.compressedTexImage3D(r.TEXTURE_2D_ARRAY,J,O,W.width,W.height,nt.depth,0,W.data,0,0);else Nt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else dt?I&&e.texSubImage3D(r.TEXTURE_2D_ARRAY,J,0,0,0,W.width,W.height,nt.depth,mt,z,W.data):e.texImage3D(r.TEXTURE_2D_ARRAY,J,O,W.width,W.height,nt.depth,0,mt,z,W.data);w.layerUpdates.size>0&&w.clearLayerUpdates()}else{dt&&ht&&e.texStorage2D(r.TEXTURE_2D,lt,O,Q[0].width,Q[0].height);for(let J=0,gt=Q.length;J<gt;J++)W=Q[J],w.format!==gn?mt!==null?dt?I&&e.compressedTexSubImage2D(r.TEXTURE_2D,J,0,0,W.width,W.height,mt,W.data):e.compressedTexImage2D(r.TEXTURE_2D,J,O,W.width,W.height,0,W.data):Nt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):dt?I&&e.texSubImage2D(r.TEXTURE_2D,J,0,0,W.width,W.height,mt,z,W.data):e.texImage2D(r.TEXTURE_2D,J,O,W.width,W.height,0,mt,z,W.data)}else if(w.isDataArrayTexture)if(dt){if(ht&&e.texStorage3D(r.TEXTURE_2D_ARRAY,lt,O,nt.width,nt.height,nt.depth),I)if(w.layerUpdates.size>0){const J=$u(nt.width,nt.height,w.format,w.type);for(const gt of w.layerUpdates){const vt=nt.data.subarray(gt*J/nt.data.BYTES_PER_ELEMENT,(gt+1)*J/nt.data.BYTES_PER_ELEMENT);e.texSubImage3D(r.TEXTURE_2D_ARRAY,0,0,0,gt,nt.width,nt.height,1,mt,z,vt)}w.clearLayerUpdates()}else e.texSubImage3D(r.TEXTURE_2D_ARRAY,0,0,0,0,nt.width,nt.height,nt.depth,mt,z,nt.data)}else e.texImage3D(r.TEXTURE_2D_ARRAY,0,O,nt.width,nt.height,nt.depth,0,mt,z,nt.data);else if(w.isData3DTexture)dt?(ht&&e.texStorage3D(r.TEXTURE_3D,lt,O,nt.width,nt.height,nt.depth),I&&e.texSubImage3D(r.TEXTURE_3D,0,0,0,0,nt.width,nt.height,nt.depth,mt,z,nt.data)):e.texImage3D(r.TEXTURE_3D,0,O,nt.width,nt.height,nt.depth,0,mt,z,nt.data);else if(w.isFramebufferTexture){if(ht)if(dt)e.texStorage2D(r.TEXTURE_2D,lt,O,nt.width,nt.height);else{let J=nt.width,gt=nt.height;for(let vt=0;vt<lt;vt++)e.texImage2D(r.TEXTURE_2D,vt,O,J,gt,0,mt,z,null),J>>=1,gt>>=1}}else if(w.isHTMLTexture){if("texElementImage2D"in r){const J=r.canvas;if(J.hasAttribute("layoutsubtree")||J.setAttribute("layoutsubtree","true"),nt.parentNode!==J){J.appendChild(nt),d.add(w),J.onpaint=gt=>{const vt=gt.changedElements;for(const ut of d)vt.includes(ut.image)&&(ut.needsUpdate=!0)},J.requestPaint();return}if(r.texElementImage2D.length===3)r.texElementImage2D(r.TEXTURE_2D,r.RGBA8,nt);else{const vt=r.RGBA,ut=r.RGBA,St=r.UNSIGNED_BYTE;r.texElementImage2D(r.TEXTURE_2D,0,vt,ut,St,nt)}r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE)}}else if(Q.length>0){if(dt&&ht){const J=Yt(Q[0]);e.texStorage2D(r.TEXTURE_2D,lt,O,J.width,J.height)}for(let J=0,gt=Q.length;J<gt;J++)W=Q[J],dt?I&&e.texSubImage2D(r.TEXTURE_2D,J,0,0,mt,z,W):e.texImage2D(r.TEXTURE_2D,J,O,mt,z,W);w.generateMipmaps=!1}else if(dt){if(ht){const J=Yt(nt);e.texStorage2D(r.TEXTURE_2D,lt,O,J.width,J.height)}I&&e.texSubImage2D(r.TEXTURE_2D,0,0,0,mt,z,nt)}else e.texImage2D(r.TEXTURE_2D,0,O,mt,z,nt);g(w)&&v(K),$.__version=k.version,w.onUpdate&&w.onUpdate(w)}U.__version=w.version}function Lt(U,w,q){if(w.image.length!==6)return;const K=Dt(U,w),ot=w.source;e.bindTexture(r.TEXTURE_CUBE_MAP,U.__webglTexture,r.TEXTURE0+q);const k=n.get(ot);if(ot.version!==k.__version||K===!0){e.activeTexture(r.TEXTURE0+q);const $=Qt.getPrimaries(Qt.workingColorSpace),X=w.colorSpace===ci?null:Qt.getPrimaries(w.colorSpace),nt=w.colorSpace===ci||$===X?r.NONE:r.BROWSER_DEFAULT_WEBGL;e.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,w.flipY),e.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL,w.premultiplyAlpha),e.pixelStorei(r.UNPACK_ALIGNMENT,w.unpackAlignment),e.pixelStorei(r.UNPACK_COLORSPACE_CONVERSION_WEBGL,nt);const mt=w.isCompressedTexture||w.image[0].isCompressedTexture,z=w.image[0]&&w.image[0].isDataTexture,O=[];for(let ut=0;ut<6;ut++)!mt&&!z?O[ut]=p(w.image[ut],!0,i.maxCubemapSize):O[ut]=z?w.image[ut].image:w.image[ut],O[ut]=Ce(w,O[ut]);const W=O[0],Q=s.convert(w.format,w.colorSpace),dt=s.convert(w.type),ht=x(w.internalFormat,Q,dt,w.normalized,w.colorSpace),I=w.isVideoTexture!==!0,lt=k.__version===void 0||K===!0,J=ot.dataReady;let gt=S(w,W);zt(r.TEXTURE_CUBE_MAP,w);let vt;if(mt){I&&lt&&e.texStorage2D(r.TEXTURE_CUBE_MAP,gt,ht,W.width,W.height);for(let ut=0;ut<6;ut++){vt=O[ut].mipmaps;for(let St=0;St<vt.length;St++){const wt=vt[St];w.format!==gn?Q!==null?I?J&&e.compressedTexSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ut,St,0,0,wt.width,wt.height,Q,wt.data):e.compressedTexImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ut,St,ht,wt.width,wt.height,0,wt.data):Nt("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):I?J&&e.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ut,St,0,0,wt.width,wt.height,Q,dt,wt.data):e.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ut,St,ht,wt.width,wt.height,0,Q,dt,wt.data)}}}else{if(vt=w.mipmaps,I&&lt){vt.length>0&&gt++;const ut=Yt(O[0]);e.texStorage2D(r.TEXTURE_CUBE_MAP,gt,ht,ut.width,ut.height)}for(let ut=0;ut<6;ut++)if(z){I?J&&e.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ut,0,0,0,O[ut].width,O[ut].height,Q,dt,O[ut].data):e.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ut,0,ht,O[ut].width,O[ut].height,0,Q,dt,O[ut].data);for(let St=0;St<vt.length;St++){const de=vt[St].image[ut].image;I?J&&e.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ut,St+1,0,0,de.width,de.height,Q,dt,de.data):e.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ut,St+1,ht,de.width,de.height,0,Q,dt,de.data)}}else{I?J&&e.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ut,0,0,0,Q,dt,O[ut]):e.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ut,0,ht,Q,dt,O[ut]);for(let St=0;St<vt.length;St++){const wt=vt[St];I?J&&e.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ut,St+1,0,0,Q,dt,wt.image[ut]):e.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+ut,St+1,ht,Q,dt,wt.image[ut])}}}g(w)&&v(r.TEXTURE_CUBE_MAP),k.__version=ot.version,w.onUpdate&&w.onUpdate(w)}U.__version=w.version}function yt(U,w,q,K,ot,k){const $=s.convert(q.format,q.colorSpace),X=s.convert(q.type),nt=x(q.internalFormat,$,X,q.normalized,q.colorSpace),mt=n.get(w),z=n.get(q);if(z.__renderTarget=w,!mt.__hasExternalTextures){const O=Math.max(1,w.width>>k),W=Math.max(1,w.height>>k);ot===r.TEXTURE_3D||ot===r.TEXTURE_2D_ARRAY?e.texImage3D(ot,k,nt,O,W,w.depth,0,$,X,null):e.texImage2D(ot,k,nt,O,W,0,$,X,null)}e.bindFramebuffer(r.FRAMEBUFFER,U),se(w)?o.framebufferTexture2DMultisampleEXT(r.FRAMEBUFFER,K,ot,z.__webglTexture,0,jt(w)):(ot===r.TEXTURE_2D||ot>=r.TEXTURE_CUBE_MAP_POSITIVE_X&&ot<=r.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&r.framebufferTexture2D(r.FRAMEBUFFER,K,ot,z.__webglTexture,k),e.bindFramebuffer(r.FRAMEBUFFER,null)}function Bt(U,w,q){if(r.bindRenderbuffer(r.RENDERBUFFER,U),w.depthBuffer){const K=w.depthTexture,ot=K&&K.isDepthTexture?K.type:null,k=b(w.stencilBuffer,ot),$=w.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT;se(w)?o.renderbufferStorageMultisampleEXT(r.RENDERBUFFER,jt(w),k,w.width,w.height):q?r.renderbufferStorageMultisample(r.RENDERBUFFER,jt(w),k,w.width,w.height):r.renderbufferStorage(r.RENDERBUFFER,k,w.width,w.height),r.framebufferRenderbuffer(r.FRAMEBUFFER,$,r.RENDERBUFFER,U)}else{const K=w.textures;for(let ot=0;ot<K.length;ot++){const k=K[ot],$=s.convert(k.format,k.colorSpace),X=s.convert(k.type),nt=x(k.internalFormat,$,X,k.normalized,k.colorSpace);se(w)?o.renderbufferStorageMultisampleEXT(r.RENDERBUFFER,jt(w),nt,w.width,w.height):q?r.renderbufferStorageMultisample(r.RENDERBUFFER,jt(w),nt,w.width,w.height):r.renderbufferStorage(r.RENDERBUFFER,nt,w.width,w.height)}}r.bindRenderbuffer(r.RENDERBUFFER,null)}function _e(U,w,q){const K=w.isWebGLCubeRenderTarget===!0;if(e.bindFramebuffer(r.FRAMEBUFFER,U),!(w.depthTexture&&w.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");const ot=n.get(w.depthTexture);if(ot.__renderTarget=w,(!ot.__webglTexture||w.depthTexture.image.width!==w.width||w.depthTexture.image.height!==w.height)&&(w.depthTexture.image.width=w.width,w.depthTexture.image.height=w.height,w.depthTexture.needsUpdate=!0),K){if(ot.__webglInit===void 0&&(ot.__webglInit=!0,w.depthTexture.addEventListener("dispose",T)),ot.__webglTexture===void 0){ot.__webglTexture=r.createTexture(),e.bindTexture(r.TEXTURE_CUBE_MAP,ot.__webglTexture),zt(r.TEXTURE_CUBE_MAP,w.depthTexture);const mt=s.convert(w.depthTexture.format),z=s.convert(w.depthTexture.type);let O;w.depthTexture.format===li?O=r.DEPTH_COMPONENT24:w.depthTexture.format===yi&&(O=r.DEPTH24_STENCIL8);for(let W=0;W<6;W++)r.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+W,0,O,w.width,w.height,0,mt,z,null)}}else it(w.depthTexture,0);const k=ot.__webglTexture,$=jt(w),X=K?r.TEXTURE_CUBE_MAP_POSITIVE_X+q:r.TEXTURE_2D,nt=w.depthTexture.format===yi?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT;if(w.depthTexture.format===li)se(w)?o.framebufferTexture2DMultisampleEXT(r.FRAMEBUFFER,nt,X,k,0,$):r.framebufferTexture2D(r.FRAMEBUFFER,nt,X,k,0);else if(w.depthTexture.format===yi)se(w)?o.framebufferTexture2DMultisampleEXT(r.FRAMEBUFFER,nt,X,k,0,$):r.framebufferTexture2D(r.FRAMEBUFFER,nt,X,k,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function Gt(U){const w=n.get(U),q=U.isWebGLCubeRenderTarget===!0;if(w.__boundDepthTexture!==U.depthTexture){const K=U.depthTexture;if(w.__depthDisposeCallback&&w.__depthDisposeCallback(),K){const ot=()=>{delete w.__boundDepthTexture,delete w.__depthDisposeCallback,K.removeEventListener("dispose",ot)};K.addEventListener("dispose",ot),w.__depthDisposeCallback=ot}w.__boundDepthTexture=K}if(U.depthTexture&&!w.__autoAllocateDepthBuffer)if(q)for(let K=0;K<6;K++)_e(w.__webglFramebuffer[K],U,K);else{const K=U.texture.mipmaps;K&&K.length>0?_e(w.__webglFramebuffer[0],U,0):_e(w.__webglFramebuffer,U,0)}else if(q){w.__webglDepthbuffer=[];for(let K=0;K<6;K++)if(e.bindFramebuffer(r.FRAMEBUFFER,w.__webglFramebuffer[K]),w.__webglDepthbuffer[K]===void 0)w.__webglDepthbuffer[K]=r.createRenderbuffer(),Bt(w.__webglDepthbuffer[K],U,!1);else{const ot=U.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT,k=w.__webglDepthbuffer[K];r.bindRenderbuffer(r.RENDERBUFFER,k),r.framebufferRenderbuffer(r.FRAMEBUFFER,ot,r.RENDERBUFFER,k)}}else{const K=U.texture.mipmaps;if(K&&K.length>0?e.bindFramebuffer(r.FRAMEBUFFER,w.__webglFramebuffer[0]):e.bindFramebuffer(r.FRAMEBUFFER,w.__webglFramebuffer),w.__webglDepthbuffer===void 0)w.__webglDepthbuffer=r.createRenderbuffer(),Bt(w.__webglDepthbuffer,U,!1);else{const ot=U.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT,k=w.__webglDepthbuffer;r.bindRenderbuffer(r.RENDERBUFFER,k),r.framebufferRenderbuffer(r.FRAMEBUFFER,ot,r.RENDERBUFFER,k)}}e.bindFramebuffer(r.FRAMEBUFFER,null)}function Vt(U,w,q){const K=n.get(U);w!==void 0&&yt(K.__webglFramebuffer,U,U.texture,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,0),q!==void 0&&Gt(U)}function Kt(U){const w=U.texture,q=n.get(U),K=n.get(w);U.addEventListener("dispose",y);const ot=U.textures,k=U.isWebGLCubeRenderTarget===!0,$=ot.length>1;if($||(K.__webglTexture===void 0&&(K.__webglTexture=r.createTexture()),K.__version=w.version,a.memory.textures++),k){q.__webglFramebuffer=[];for(let X=0;X<6;X++)if(w.mipmaps&&w.mipmaps.length>0){q.__webglFramebuffer[X]=[];for(let nt=0;nt<w.mipmaps.length;nt++)q.__webglFramebuffer[X][nt]=r.createFramebuffer()}else q.__webglFramebuffer[X]=r.createFramebuffer()}else{if(w.mipmaps&&w.mipmaps.length>0){q.__webglFramebuffer=[];for(let X=0;X<w.mipmaps.length;X++)q.__webglFramebuffer[X]=r.createFramebuffer()}else q.__webglFramebuffer=r.createFramebuffer();if($)for(let X=0,nt=ot.length;X<nt;X++){const mt=n.get(ot[X]);mt.__webglTexture===void 0&&(mt.__webglTexture=r.createTexture(),a.memory.textures++)}if(U.samples>0&&se(U)===!1){q.__webglMultisampledFramebuffer=r.createFramebuffer(),q.__webglColorRenderbuffer=[],e.bindFramebuffer(r.FRAMEBUFFER,q.__webglMultisampledFramebuffer);for(let X=0;X<ot.length;X++){const nt=ot[X];q.__webglColorRenderbuffer[X]=r.createRenderbuffer(),r.bindRenderbuffer(r.RENDERBUFFER,q.__webglColorRenderbuffer[X]);const mt=s.convert(nt.format,nt.colorSpace),z=s.convert(nt.type),O=x(nt.internalFormat,mt,z,nt.normalized,nt.colorSpace,U.isXRRenderTarget===!0),W=jt(U);r.renderbufferStorageMultisample(r.RENDERBUFFER,W,O,U.width,U.height),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+X,r.RENDERBUFFER,q.__webglColorRenderbuffer[X])}r.bindRenderbuffer(r.RENDERBUFFER,null),U.depthBuffer&&(q.__webglDepthRenderbuffer=r.createRenderbuffer(),Bt(q.__webglDepthRenderbuffer,U,!0)),e.bindFramebuffer(r.FRAMEBUFFER,null)}}if(k){e.bindTexture(r.TEXTURE_CUBE_MAP,K.__webglTexture),zt(r.TEXTURE_CUBE_MAP,w);for(let X=0;X<6;X++)if(w.mipmaps&&w.mipmaps.length>0)for(let nt=0;nt<w.mipmaps.length;nt++)yt(q.__webglFramebuffer[X][nt],U,w,r.COLOR_ATTACHMENT0,r.TEXTURE_CUBE_MAP_POSITIVE_X+X,nt);else yt(q.__webglFramebuffer[X],U,w,r.COLOR_ATTACHMENT0,r.TEXTURE_CUBE_MAP_POSITIVE_X+X,0);g(w)&&v(r.TEXTURE_CUBE_MAP),e.unbindTexture()}else if($){for(let X=0,nt=ot.length;X<nt;X++){const mt=ot[X],z=n.get(mt);let O=r.TEXTURE_2D;(U.isWebGL3DRenderTarget||U.isWebGLArrayRenderTarget)&&(O=U.isWebGL3DRenderTarget?r.TEXTURE_3D:r.TEXTURE_2D_ARRAY),e.bindTexture(O,z.__webglTexture),zt(O,mt),yt(q.__webglFramebuffer,U,mt,r.COLOR_ATTACHMENT0+X,O,0),g(mt)&&v(O)}e.unbindTexture()}else{let X=r.TEXTURE_2D;if((U.isWebGL3DRenderTarget||U.isWebGLArrayRenderTarget)&&(X=U.isWebGL3DRenderTarget?r.TEXTURE_3D:r.TEXTURE_2D_ARRAY),e.bindTexture(X,K.__webglTexture),zt(X,w),w.mipmaps&&w.mipmaps.length>0)for(let nt=0;nt<w.mipmaps.length;nt++)yt(q.__webglFramebuffer[nt],U,w,r.COLOR_ATTACHMENT0,X,nt);else yt(q.__webglFramebuffer,U,w,r.COLOR_ATTACHMENT0,X,0);g(w)&&v(X),e.unbindTexture()}U.depthBuffer&&Gt(U)}function Ht(U){const w=U.textures;for(let q=0,K=w.length;q<K;q++){const ot=w[q];if(g(ot)){const k=M(U),$=n.get(ot).__webglTexture;e.bindTexture(k,$),v(k),e.unbindTexture()}}}const ee=[],fe=[];function Le(U){if(U.samples>0){if(se(U)===!1){const w=U.textures,q=U.width,K=U.height;let ot=r.COLOR_BUFFER_BIT;const k=U.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT,$=n.get(U),X=w.length>1;if(X)for(let mt=0;mt<w.length;mt++)e.bindFramebuffer(r.FRAMEBUFFER,$.__webglMultisampledFramebuffer),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+mt,r.RENDERBUFFER,null),e.bindFramebuffer(r.FRAMEBUFFER,$.__webglFramebuffer),r.framebufferTexture2D(r.DRAW_FRAMEBUFFER,r.COLOR_ATTACHMENT0+mt,r.TEXTURE_2D,null,0);e.bindFramebuffer(r.READ_FRAMEBUFFER,$.__webglMultisampledFramebuffer);const nt=U.texture.mipmaps;nt&&nt.length>0?e.bindFramebuffer(r.DRAW_FRAMEBUFFER,$.__webglFramebuffer[0]):e.bindFramebuffer(r.DRAW_FRAMEBUFFER,$.__webglFramebuffer);for(let mt=0;mt<w.length;mt++){if(U.resolveDepthBuffer&&(U.depthBuffer&&(ot|=r.DEPTH_BUFFER_BIT),U.stencilBuffer&&U.resolveStencilBuffer&&(ot|=r.STENCIL_BUFFER_BIT)),X){r.framebufferRenderbuffer(r.READ_FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.RENDERBUFFER,$.__webglColorRenderbuffer[mt]);const z=n.get(w[mt]).__webglTexture;r.framebufferTexture2D(r.DRAW_FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,z,0)}r.blitFramebuffer(0,0,q,K,0,0,q,K,ot,r.NEAREST),l===!0&&(ee.length=0,fe.length=0,ee.push(r.COLOR_ATTACHMENT0+mt),U.depthBuffer&&U.storeMultisampledDepthBuffer===!1&&(ee.push(k),fe.push(k),r.invalidateFramebuffer(r.DRAW_FRAMEBUFFER,fe)),r.invalidateFramebuffer(r.READ_FRAMEBUFFER,ee))}if(e.bindFramebuffer(r.READ_FRAMEBUFFER,null),e.bindFramebuffer(r.DRAW_FRAMEBUFFER,null),X)for(let mt=0;mt<w.length;mt++){e.bindFramebuffer(r.FRAMEBUFFER,$.__webglMultisampledFramebuffer),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+mt,r.RENDERBUFFER,$.__webglColorRenderbuffer[mt]);const z=n.get(w[mt]).__webglTexture;e.bindFramebuffer(r.FRAMEBUFFER,$.__webglFramebuffer),r.framebufferTexture2D(r.DRAW_FRAMEBUFFER,r.COLOR_ATTACHMENT0+mt,r.TEXTURE_2D,z,0)}e.bindFramebuffer(r.DRAW_FRAMEBUFFER,$.__webglMultisampledFramebuffer)}else if(U.depthBuffer&&U.storeMultisampledDepthBuffer===!1&&l){const w=U.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT;r.invalidateFramebuffer(r.DRAW_FRAMEBUFFER,[w])}}}function jt(U){return Math.min(i.maxSamples,U.samples)}function se(U){const w=n.get(U);return U.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&w.__useRenderToTexture!==!1}function H(U){const w=a.render.frame;h.get(U)!==w&&(h.set(U,w),U.update())}function Ce(U,w){const q=U.colorSpace,K=U.format,ot=U.type;return U.isCompressedTexture===!0||U.isVideoTexture===!0||q!==xn&&q!==ci&&(Qt.getTransfer(q)===he?(K!==gn||ot!==sn)&&Nt("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Ot("WebGLTextures: Unsupported texture color space:",q)),w}function Yt(U){return typeof HTMLImageElement<"u"&&U instanceof HTMLImageElement?(c.width=U.naturalWidth||U.width,c.height=U.naturalHeight||U.height):typeof VideoFrame<"u"&&U instanceof VideoFrame?(c.width=U.displayWidth,c.height=U.displayHeight):(c.width=U.width,c.height=U.height),c}this.allocateTextureUnit=V,this.resetTextureUnits=N,this.getTextureUnits=R,this.setTextureUnits=B,this.setTexture2D=it,this.setTexture2DArray=Z,this.setTexture3D=j,this.setTextureCube=ct,this.rebindTextures=Vt,this.setupRenderTarget=Kt,this.updateRenderTargetMipmap=Ht,this.updateMultisampleRenderTarget=Le,this.setupDepthRenderbuffer=Gt,this.setupFrameBufferTexture=yt,this.useMultisampledRTT=se,this.isReversedDepthBuffer=function(){return e.buffers.depth.getReversed()}}function v_(r,t){function e(n,i=ci){let s;const a=Qt.getTransfer(i);if(n===sn)return r.UNSIGNED_BYTE;if(n===Co)return r.UNSIGNED_SHORT_4_4_4_4;if(n===Ro)return r.UNSIGNED_SHORT_5_5_5_1;if(n===hh)return r.UNSIGNED_INT_5_9_9_9_REV;if(n===uh)return r.UNSIGNED_INT_10F_11F_11F_REV;if(n===lh)return r.BYTE;if(n===ch)return r.SHORT;if(n===js)return r.UNSIGNED_SHORT;if(n===Eo)return r.INT;if(n===qn)return r.UNSIGNED_INT;if(n===wn)return r.FLOAT;if(n===Je)return r.HALF_FLOAT;if(n===fh)return r.ALPHA;if(n===dh)return r.RGB;if(n===gn)return r.RGBA;if(n===li)return r.DEPTH_COMPONENT;if(n===yi)return r.DEPTH_STENCIL;if(n===$r)return r.RED;if(n===Po)return r.RED_INTEGER;if(n===zi)return r.RG;if(n===Io)return r.RG_INTEGER;if(n===Lo)return r.RGBA_INTEGER;if(n===Kr||n===Jr||n===jr||n===Qr)if(a===he)if(s=t.get("WEBGL_compressed_texture_s3tc_srgb"),s!==null){if(n===Kr)return s.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Jr)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===jr)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Qr)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(s=t.get("WEBGL_compressed_texture_s3tc"),s!==null){if(n===Kr)return s.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Jr)return s.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===jr)return s.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Qr)return s.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===Do||n===Uo||n===No||n===Fo)if(s=t.get("WEBGL_compressed_texture_pvrtc"),s!==null){if(n===Do)return s.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Uo)return s.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===No)return s.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===Fo)return s.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===zo||n===Oo||n===Bo||n===ko||n===Vo||n===ta||n===Ho)if(s=t.get("WEBGL_compressed_texture_etc"),s!==null){if(n===zo||n===Oo)return a===he?s.COMPRESSED_SRGB8_ETC2:s.COMPRESSED_RGB8_ETC2;if(n===Bo)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:s.COMPRESSED_RGBA8_ETC2_EAC;if(n===ko)return s.COMPRESSED_R11_EAC;if(n===Vo)return s.COMPRESSED_SIGNED_R11_EAC;if(n===ta)return s.COMPRESSED_RG11_EAC;if(n===Ho)return s.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===Go||n===Wo||n===Xo||n===Yo||n===qo||n===Zo||n===$o||n===Ko||n===Jo||n===jo||n===Qo||n===tl||n===el||n===nl)if(s=t.get("WEBGL_compressed_texture_astc"),s!==null){if(n===Go)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:s.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===Wo)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:s.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===Xo)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:s.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===Yo)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:s.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===qo)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:s.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===Zo)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:s.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===$o)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:s.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===Ko)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:s.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===Jo)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:s.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===jo)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:s.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===Qo)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:s.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===tl)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:s.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===el)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:s.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===nl)return a===he?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:s.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===il||n===sl||n===rl)if(s=t.get("EXT_texture_compression_bptc"),s!==null){if(n===il)return a===he?s.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:s.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===sl)return s.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===rl)return s.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===al||n===ol||n===ea||n===ll)if(s=t.get("EXT_texture_compression_rgtc"),s!==null){if(n===al)return s.COMPRESSED_RED_RGTC1_EXT;if(n===ol)return s.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===ea)return s.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===ll)return s.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===ts?r.UNSIGNED_INT_24_8:r[n]!==void 0?r[n]:null}return{convert:e}}const __=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,M_=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class y_{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e){if(this.texture===null){const n=new uu(t.texture);(t.depthNear!==e.depthNear||t.depthFar!==e.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=n}}getMesh(t){if(this.texture!==null&&this.mesh===null){const e=t.cameras[0].viewport,n=new le({vertexShader:__,fragmentShader:M_,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new Xt(new Vn(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class S_ extends bi{constructor(t,e){super();const n=this;let i=null,s=1,a=null,o="local-floor",l=1,c=null,h=null,d=null,u=null,f=null,m=null;const _=typeof XRWebGLBinding<"u",p=new y_,g={},v=e.getContextAttributes();let M=null,x=null;const b=[],S=[],T=new ft;let y=null,A=null;const E=new on;E.viewport=new ue;const P=new on;P.viewport=new ue;const D=[E,P],N=new Jm;let R=null,B=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(st){let rt=b[st];return rt===void 0&&(rt=new Sl,b[st]=rt),rt.getTargetRaySpace()},this.getControllerGrip=function(st){let rt=b[st];return rt===void 0&&(rt=new Sl,b[st]=rt),rt.getGripSpace()},this.getHand=function(st){let rt=b[st];return rt===void 0&&(rt=new Sl,b[st]=rt),rt.getHandSpace()};function V(st){const rt=S.indexOf(st.inputSource);if(rt===-1)return;const Mt=b[rt];Mt!==void 0&&(Mt.update(st.inputSource,st.frame,c||a),Mt.dispatchEvent({type:st.type,data:st.inputSource}))}function Y(){i.removeEventListener("select",V),i.removeEventListener("selectstart",V),i.removeEventListener("selectend",V),i.removeEventListener("squeeze",V),i.removeEventListener("squeezestart",V),i.removeEventListener("squeezeend",V),i.removeEventListener("end",Y),i.removeEventListener("inputsourceschange",it);for(let st=0;st<b.length;st++){const rt=S[st];rt!==null&&(S[st]=null,b[st].disconnect(rt))}R=null,B=null,p.reset();for(const st in g)delete g[st];if(t.setRenderTarget(M),f=null,u=null,d=null,i=null,x=null,Dt.stop(),n.isPresenting=!1,t.setPixelRatio(y),t.setSize(T.width,T.height,!1),A!==null){const st=A.camera;st.fov=A.fov,st.zoom=A.zoom,st.updateProjectionMatrix(),A=null}n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(st){s=st,n.isPresenting===!0&&Nt("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(st){o=st,n.isPresenting===!0&&Nt("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(st){c=st},this.getBaseLayer=function(){return u!==null?u:f},this.getBinding=function(){return d===null&&_&&(d=new XRWebGLBinding(i,e)),d},this.getFrame=function(){return m},this.getSession=function(){return i},this.setSession=async function(st){if(i=st,i!==null){if(M=t.getRenderTarget(),i.addEventListener("select",V),i.addEventListener("selectstart",V),i.addEventListener("selectend",V),i.addEventListener("squeeze",V),i.addEventListener("squeezestart",V),i.addEventListener("squeezeend",V),i.addEventListener("end",Y),i.addEventListener("inputsourceschange",it),v.xrCompatible!==!0&&await e.makeXRCompatible(),y=t.getPixelRatio(),t.getSize(T),_&&"createProjectionLayer"in XRWebGLBinding.prototype){let Mt=null,Lt=null,yt=null;v.depth&&(yt=v.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,Mt=v.stencil?yi:li,Lt=v.stencil?ts:qn);const Bt={colorFormat:e.RGBA8,depthFormat:yt,scaleFactor:s};d=this.getBinding(),u=d.createProjectionLayer(Bt),i.updateRenderState({layers:[u]}),t.setPixelRatio(1),t.setSize(u.textureWidth,u.textureHeight,!1),x=new $e(u.textureWidth,u.textureHeight,{format:gn,type:sn,depthTexture:new ys(u.textureWidth,u.textureHeight,Lt,void 0,void 0,void 0,void 0,void 0,void 0,Mt),stencilBuffer:v.stencil,colorSpace:t.outputColorSpace,samples:v.antialias?4:0,resolveDepthBuffer:u.ignoreDepthValues===!1,resolveStencilBuffer:u.ignoreDepthValues===!1,storeMultisampledDepthBuffer:u.ignoreDepthValues===!1,storeMultisampledStencilBuffer:u.ignoreDepthValues===!1})}else{const Mt={antialias:v.antialias,alpha:!0,depth:v.depth,stencil:v.stencil,framebufferScaleFactor:s};f=new XRWebGLLayer(i,e,Mt),i.updateRenderState({baseLayer:f}),t.setPixelRatio(1),t.setSize(f.framebufferWidth,f.framebufferHeight,!1),x=new $e(f.framebufferWidth,f.framebufferHeight,{format:gn,type:sn,colorSpace:t.outputColorSpace,stencilBuffer:v.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1,storeMultisampledDepthBuffer:f.ignoreDepthValues===!1,storeMultisampledStencilBuffer:f.ignoreDepthValues===!1})}x.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await i.requestReferenceSpace(o),Dt.setContext(i),Dt.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode},this.getDepthTexture=function(){return p.getDepthTexture()};function it(st){for(let rt=0;rt<st.removed.length;rt++){const Mt=st.removed[rt],Lt=S.indexOf(Mt);Lt>=0&&(S[Lt]=null,b[Lt].disconnect(Mt))}for(let rt=0;rt<st.added.length;rt++){const Mt=st.added[rt];let Lt=S.indexOf(Mt);if(Lt===-1){for(let Bt=0;Bt<b.length;Bt++)if(Bt>=S.length){S.push(Mt),Lt=Bt;break}else if(S[Bt]===null){S[Bt]=Mt,Lt=Bt;break}if(Lt===-1)break}const yt=b[Lt];yt&&yt.connect(Mt)}}const Z=new L,j=new L;function ct(st,rt,Mt){Z.setFromMatrixPosition(rt.matrixWorld),j.setFromMatrixPosition(Mt.matrixWorld);const Lt=Z.distanceTo(j),yt=rt.projectionMatrix.elements,Bt=Mt.projectionMatrix.elements,_e=yt[14]/(yt[10]-1),Gt=yt[14]/(yt[10]+1),Vt=(yt[9]+1)/yt[5],Kt=(yt[9]-1)/yt[5],Ht=(yt[8]-1)/yt[0],ee=(Bt[8]+1)/Bt[0],fe=_e*Ht,Le=_e*ee,jt=Lt/(-Ht+ee),se=jt*-Ht;if(rt.matrixWorld.decompose(st.position,st.quaternion,st.scale),st.translateX(se),st.translateZ(jt),st.matrixWorld.compose(st.position,st.quaternion,st.scale),st.matrixWorldInverse.copy(st.matrixWorld).invert(),yt[10]===-1)st.projectionMatrix.copy(rt.projectionMatrix),st.projectionMatrixInverse.copy(rt.projectionMatrixInverse);else{const H=_e+jt,Ce=Gt+jt,Yt=fe-se,U=Le+(Lt-se),w=Vt*Gt/Ce*H,q=Kt*Gt/Ce*H;st.projectionMatrix.makePerspective(Yt,U,w,q,H,Ce),st.projectionMatrixInverse.copy(st.projectionMatrix).invert()}}function xt(st,rt){rt===null?st.matrixWorld.copy(st.matrix):st.matrixWorld.multiplyMatrices(rt.matrixWorld,st.matrix),st.matrixWorldInverse.copy(st.matrixWorld).invert()}this.updateCamera=function(st){if(i===null)return;let rt=st.near,Mt=st.far;p.texture!==null&&(p.depthNear>0&&(rt=p.depthNear),p.depthFar>0&&(Mt=p.depthFar)),N.near=P.near=E.near=rt,N.far=P.far=E.far=Mt,(R!==N.near||B!==N.far)&&(i.updateRenderState({depthNear:N.near,depthFar:N.far}),R=N.near,B=N.far),N.layers.mask=st.layers.mask|6,E.layers.mask=N.layers.mask&-5,P.layers.mask=N.layers.mask&-3;const Lt=st.parent,yt=N.cameras;xt(N,Lt);for(let Bt=0;Bt<yt.length;Bt++)xt(yt[Bt],Lt);yt.length===2?ct(N,E,P):N.projectionMatrix.copy(E.projectionMatrix),A===null&&st.isPerspectiveCamera&&(A={camera:st,fov:st.fov,zoom:st.zoom}),_t(st,N,Lt)};function _t(st,rt,Mt){Mt===null?st.matrix.copy(rt.matrixWorld):(st.matrix.copy(Mt.matrixWorld),st.matrix.invert(),st.matrix.multiply(rt.matrixWorld)),st.matrix.decompose(st.position,st.quaternion,st.scale),st.updateMatrixWorld(!0),st.projectionMatrix.copy(rt.projectionMatrix),st.projectionMatrixInverse.copy(rt.projectionMatrixInverse),st.isPerspectiveCamera&&(st.fov=ns*2*Math.atan(1/st.projectionMatrix.elements[5]),st.zoom=1)}this.getCamera=function(){return N},this.getFoveation=function(){if(!(u===null&&f===null))return l},this.setFoveation=function(st){l=st,u!==null&&(u.fixedFoveation=st),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=st)},this.hasDepthSensing=function(){return p.texture!==null},this.getDepthSensingMesh=function(){return p.getMesh(N)},this.getCameraTexture=function(st){return g[st]};let kt=null;function zt(st,rt){if(h=rt.getViewerPose(c||a),m=rt,h!==null){const Mt=h.views;f!==null&&(t.setRenderTargetFramebuffer(x,f.framebuffer),t.setRenderTarget(x));let Lt=!1;Mt.length!==N.cameras.length&&(N.cameras.length=0,Lt=!0);for(let Gt=0;Gt<Mt.length;Gt++){const Vt=Mt[Gt];let Kt=null;if(f!==null)Kt=f.getViewport(Vt);else{const ee=d.getViewSubImage(u,Vt);Kt=ee.viewport,Gt===0&&(t.setRenderTargetTextures(x,ee.colorTexture,ee.depthStencilTexture),t.setRenderTarget(x))}let Ht=D[Gt];Ht===void 0&&(Ht=new on,Ht.layers.enable(Gt),Ht.viewport=new ue,D[Gt]=Ht),Ht.matrix.fromArray(Vt.transform.matrix),Ht.matrix.decompose(Ht.position,Ht.quaternion,Ht.scale),Ht.projectionMatrix.fromArray(Vt.projectionMatrix),Ht.projectionMatrixInverse.copy(Ht.projectionMatrix).invert(),Ht.viewport.set(Kt.x,Kt.y,Kt.width,Kt.height),Gt===0&&(N.matrix.copy(Ht.matrix),N.matrix.decompose(N.position,N.quaternion,N.scale)),Lt===!0&&N.cameras.push(Ht)}const yt=i.enabledFeatures;if(yt&&yt.includes("depth-sensing")&&i.depthUsage=="gpu-optimized"&&_){d=n.getBinding();const Gt=d.getDepthInformation(Mt[0]);Gt&&Gt.isValid&&Gt.texture&&p.init(Gt,i.renderState)}if(yt&&yt.includes("camera-access")&&_){t.state.unbindTexture(),d=n.getBinding();for(let Gt=0;Gt<Mt.length;Gt++){const Vt=Mt[Gt].camera;if(Vt){let Kt=g[Vt];Kt||(Kt=new uu,g[Vt]=Kt);const Ht=d.getCameraImage(Vt);Kt.sourceTexture=Ht}}}}for(let Mt=0;Mt<b.length;Mt++){const Lt=S[Mt],yt=b[Mt];Lt!==null&&yt!==void 0&&yt.update(Lt,rt,c||a)}kt&&kt(st,rt),rt.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:rt}),m=null}const Dt=new Ku;Dt.setAnimationLoop(zt),this.setAnimationLoop=function(st){kt=st},this.dispose=function(){}}}const b_=new It,Tf=new Wt;Tf.set(-1,0,0,0,1,0,0,0,1);function w_(r,t){function e(p,g){p.matrixAutoUpdate===!0&&p.updateMatrix(),g.value.copy(p.matrix)}function n(p,g){g.color.getRGB(p.fogColor.value,Pu(r)),g.isFog?(p.fogNear.value=g.near,p.fogFar.value=g.far):g.isFogExp2&&(p.fogDensity.value=g.density)}function i(p,g,v,M,x){g.isNodeMaterial?g.uniformsNeedUpdate=!1:g.isMeshBasicMaterial?s(p,g):g.isMeshLambertMaterial?(s(p,g),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)):g.isMeshToonMaterial?(s(p,g),d(p,g)):g.isMeshPhongMaterial?(s(p,g),h(p,g),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)):g.isMeshStandardMaterial?(s(p,g),u(p,g),g.isMeshPhysicalMaterial&&f(p,g,x)):g.isMeshMatcapMaterial?(s(p,g),m(p,g)):g.isMeshDepthMaterial?s(p,g):g.isMeshDistanceMaterial?(s(p,g),_(p,g)):g.isMeshNormalMaterial?s(p,g):g.isLineBasicMaterial?(a(p,g),g.isLineDashedMaterial&&o(p,g)):g.isPointsMaterial?l(p,g,v,M):g.isSpriteMaterial?c(p,g):g.isShadowMaterial?(p.color.value.copy(g.color),p.opacity.value=g.opacity):g.isShaderMaterial&&(g.uniformsNeedUpdate=!1)}function s(p,g){p.opacity.value=g.opacity,g.color&&p.diffuse.value.copy(g.color),g.emissive&&p.emissive.value.copy(g.emissive).multiplyScalar(g.emissiveIntensity),g.map&&(p.map.value=g.map,e(g.map,p.mapTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,e(g.alphaMap,p.alphaMapTransform)),g.bumpMap&&(p.bumpMap.value=g.bumpMap,e(g.bumpMap,p.bumpMapTransform),p.bumpScale.value=g.bumpScale,g.side===nn&&(p.bumpScale.value*=-1)),g.normalMap&&(p.normalMap.value=g.normalMap,e(g.normalMap,p.normalMapTransform),p.normalScale.value.copy(g.normalScale),g.side===nn&&p.normalScale.value.negate()),g.displacementMap&&(p.displacementMap.value=g.displacementMap,e(g.displacementMap,p.displacementMapTransform),p.displacementScale.value=g.displacementScale,p.displacementBias.value=g.displacementBias),g.emissiveMap&&(p.emissiveMap.value=g.emissiveMap,e(g.emissiveMap,p.emissiveMapTransform)),g.specularMap&&(p.specularMap.value=g.specularMap,e(g.specularMap,p.specularMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest);const v=t.get(g),M=v.envMap,x=v.envMapRotation;M&&(p.envMap.value=M,p.envMapRotation.value.setFromMatrix4(b_.makeRotationFromEuler(x)).transpose(),M.isCubeTexture&&M.isRenderTargetTexture===!1&&p.envMapRotation.value.premultiply(Tf),p.reflectivity.value=g.reflectivity,p.ior.value=g.ior,p.refractionRatio.value=g.refractionRatio),g.lightMap&&(p.lightMap.value=g.lightMap,p.lightMapIntensity.value=g.lightMapIntensity,e(g.lightMap,p.lightMapTransform)),g.aoMap&&(p.aoMap.value=g.aoMap,p.aoMapIntensity.value=g.aoMapIntensity,e(g.aoMap,p.aoMapTransform))}function a(p,g){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,g.map&&(p.map.value=g.map,e(g.map,p.mapTransform))}function o(p,g){p.dashSize.value=g.dashSize,p.totalSize.value=g.dashSize+g.gapSize,p.scale.value=g.scale}function l(p,g,v,M){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,p.size.value=g.size*v,p.scale.value=M*.5,g.map&&(p.map.value=g.map,e(g.map,p.uvTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,e(g.alphaMap,p.alphaMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest)}function c(p,g){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,p.rotation.value=g.rotation,g.map&&(p.map.value=g.map,e(g.map,p.mapTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,e(g.alphaMap,p.alphaMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest)}function h(p,g){p.specular.value.copy(g.specular),p.shininess.value=Math.max(g.shininess,1e-4)}function d(p,g){g.gradientMap&&(p.gradientMap.value=g.gradientMap)}function u(p,g){p.metalness.value=g.metalness,g.metalnessMap&&(p.metalnessMap.value=g.metalnessMap,e(g.metalnessMap,p.metalnessMapTransform)),p.roughness.value=g.roughness,g.roughnessMap&&(p.roughnessMap.value=g.roughnessMap,e(g.roughnessMap,p.roughnessMapTransform)),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)}function f(p,g,v){p.ior.value=g.ior,g.sheen>0&&(p.sheenColor.value.copy(g.sheenColor).multiplyScalar(g.sheen),p.sheenRoughness.value=g.sheenRoughness,g.sheenColorMap&&(p.sheenColorMap.value=g.sheenColorMap,e(g.sheenColorMap,p.sheenColorMapTransform)),g.sheenRoughnessMap&&(p.sheenRoughnessMap.value=g.sheenRoughnessMap,e(g.sheenRoughnessMap,p.sheenRoughnessMapTransform))),g.clearcoat>0&&(p.clearcoat.value=g.clearcoat,p.clearcoatRoughness.value=g.clearcoatRoughness,g.clearcoatMap&&(p.clearcoatMap.value=g.clearcoatMap,e(g.clearcoatMap,p.clearcoatMapTransform)),g.clearcoatRoughnessMap&&(p.clearcoatRoughnessMap.value=g.clearcoatRoughnessMap,e(g.clearcoatRoughnessMap,p.clearcoatRoughnessMapTransform)),g.clearcoatNormalMap&&(p.clearcoatNormalMap.value=g.clearcoatNormalMap,e(g.clearcoatNormalMap,p.clearcoatNormalMapTransform),p.clearcoatNormalScale.value.copy(g.clearcoatNormalScale),g.side===nn&&p.clearcoatNormalScale.value.negate())),g.dispersion>0&&(p.dispersion.value=g.dispersion),g.retroreflectivity>0&&(p.retroreflectivity.value=g.retroreflectivity),g.iridescence>0&&(p.iridescence.value=g.iridescence,p.iridescenceIOR.value=g.iridescenceIOR,p.iridescenceThicknessMinimum.value=g.iridescenceThicknessRange[0],p.iridescenceThicknessMaximum.value=g.iridescenceThicknessRange[1],g.iridescenceMap&&(p.iridescenceMap.value=g.iridescenceMap,e(g.iridescenceMap,p.iridescenceMapTransform)),g.iridescenceThicknessMap&&(p.iridescenceThicknessMap.value=g.iridescenceThicknessMap,e(g.iridescenceThicknessMap,p.iridescenceThicknessMapTransform))),g.transmission>0&&(p.transmission.value=g.transmission,p.transmissionSamplerMap.value=v.texture,p.transmissionSamplerSize.value.set(v.width,v.height),g.transmissionMap&&(p.transmissionMap.value=g.transmissionMap,e(g.transmissionMap,p.transmissionMapTransform)),p.thickness.value=g.thickness,g.thicknessMap&&(p.thicknessMap.value=g.thicknessMap,e(g.thicknessMap,p.thicknessMapTransform)),p.attenuationDistance.value=g.attenuationDistance,p.attenuationColor.value.copy(g.attenuationColor)),g.anisotropy>0&&(p.anisotropyVector.value.set(g.anisotropy*Math.cos(g.anisotropyRotation),g.anisotropy*Math.sin(g.anisotropyRotation)),g.anisotropyMap&&(p.anisotropyMap.value=g.anisotropyMap,e(g.anisotropyMap,p.anisotropyMapTransform))),p.specularIntensity.value=g.specularIntensity,p.specularColor.value.copy(g.specularColor),g.specularColorMap&&(p.specularColorMap.value=g.specularColorMap,e(g.specularColorMap,p.specularColorMapTransform)),g.specularIntensityMap&&(p.specularIntensityMap.value=g.specularIntensityMap,e(g.specularIntensityMap,p.specularIntensityMapTransform))}function m(p,g){g.matcap&&(p.matcap.value=g.matcap)}function _(p,g){const v=t.get(g).light;p.referencePosition.value.setFromMatrixPosition(v.matrixWorld),p.nearDistance.value=v.shadow.camera.near,p.farDistance.value=v.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:i}}function A_(r,t,e,n){let i={},s={},a=[];const o=r.getParameter(r.MAX_UNIFORM_BUFFER_BINDINGS);function l(x,b){const S=b.program;n.uniformBlockBinding(x,S)}function c(x,b){let S=i[x.id];S===void 0&&(p(x),S=h(x),i[x.id]=S,x.addEventListener("dispose",v));const T=b.program;n.updateUBOMapping(x,T);const y=t.render.frame;s[x.id]!==y&&(u(x),s[x.id]=y)}function h(x){const b=d();x.__bindingPointIndex=b;const S=r.createBuffer(),T=x.__size,y=x.usage;return r.bindBuffer(r.UNIFORM_BUFFER,S),r.bufferData(r.UNIFORM_BUFFER,T,y),r.bindBuffer(r.UNIFORM_BUFFER,null),r.bindBufferBase(r.UNIFORM_BUFFER,b,S),S}function d(){for(let x=0;x<o;x++)if(a.indexOf(x)===-1)return a.push(x),x;return Ot("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function u(x){const b=i[x.id],S=x.uniforms,T=x.__cache;r.bindBuffer(r.UNIFORM_BUFFER,b);for(let y=0,A=S.length;y<A;y++){const E=S[y];if(Array.isArray(E))for(let P=0,D=E.length;P<D;P++)f(E[P],y,P,T);else f(E,y,0,T)}r.bindBuffer(r.UNIFORM_BUFFER,null)}function f(x,b,S,T){if(_(x,b,S,T)===!0){const y=x.__offset,A=x.value;if(Array.isArray(A)){let E=0;for(let P=0;P<A.length;P++){const D=A[P],N=g(D);m(D,x.__data,E),typeof D!="number"&&typeof D!="boolean"&&!D.isMatrix3&&!ArrayBuffer.isView(D)&&(E+=N.storage/Float32Array.BYTES_PER_ELEMENT)}}else m(A,x.__data,0);r.bufferSubData(r.UNIFORM_BUFFER,y,x.__data)}}function m(x,b,S){typeof x=="number"||typeof x=="boolean"?b[0]=x:x.isMatrix3?(b[0]=x.elements[0],b[1]=x.elements[1],b[2]=x.elements[2],b[3]=0,b[4]=x.elements[3],b[5]=x.elements[4],b[6]=x.elements[5],b[7]=0,b[8]=x.elements[6],b[9]=x.elements[7],b[10]=x.elements[8],b[11]=0):ArrayBuffer.isView(x)?b.set(new x.constructor(x.buffer,x.byteOffset,b.length)):x.toArray(b,S)}function _(x,b,S,T){const y=x.value,A=b+"_"+S;if(T[A]===void 0)return typeof y=="number"||typeof y=="boolean"?T[A]=y:ArrayBuffer.isView(y)?T[A]=y.slice():T[A]=y.clone(),!0;{const E=T[A];if(typeof y=="number"||typeof y=="boolean"){if(E!==y)return T[A]=y,!0}else{if(ArrayBuffer.isView(y))return!0;if(E.equals(y)===!1)return E.copy(y),!0}}return!1}function p(x){const b=x.uniforms;let S=0;const T=16;for(let A=0,E=b.length;A<E;A++){const P=Array.isArray(b[A])?b[A]:[b[A]];for(let D=0,N=P.length;D<N;D++){const R=P[D],B=Array.isArray(R.value)?R.value:[R.value];for(let V=0,Y=B.length;V<Y;V++){const it=B[V],Z=g(it),j=S%T,ct=j%Z.boundary,xt=j+ct;S+=ct,xt!==0&&T-xt<Z.storage&&(S+=T-xt),R.__data=new Float32Array(Z.storage/Float32Array.BYTES_PER_ELEMENT),R.__offset=S,S+=Z.storage}}}const y=S%T;return y>0&&(S+=T-y),x.__size=S,x.__cache={},this}function g(x){const b={boundary:0,storage:0};return typeof x=="number"||typeof x=="boolean"?(b.boundary=4,b.storage=4):x.isVector2?(b.boundary=8,b.storage=8):x.isVector3||x.isColor?(b.boundary=16,b.storage=12):x.isVector4?(b.boundary=16,b.storage=16):x.isMatrix3?(b.boundary=48,b.storage=48):x.isMatrix4?(b.boundary=64,b.storage=64):x.isTexture?Nt("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(x)?(b.boundary=16,b.storage=x.byteLength):Nt("WebGLRenderer: Unsupported uniform value type.",x),b}function v(x){const b=x.target;b.removeEventListener("dispose",v);const S=a.indexOf(b.__bindingPointIndex);a.splice(S,1),r.deleteBuffer(i[b.id]),delete i[b.id],delete s[b.id]}function M(){for(const x in i)r.deleteBuffer(i[x]);a=[],i={},s={}}return{bind:l,update:c,dispose:M}}const T_=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);let ei=null;function E_(){return ei===null&&(ei=new _s(T_,16,16,zi,Je),ei.name="DFG_LUT",ei.minFilter=Ne,ei.magFilter=Ne,ei.wrapS=bn,ei.wrapT=bn,ei.generateMipmaps=!1,ei.needsUpdate=!0),ei}class C_{constructor(t={}){const{canvas:e=Jd(),context:n=null,depth:i=!0,stencil:s=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:d=!1,reversedDepthBuffer:u=!1,outputBufferType:f=sn}=t;this.isWebGLRenderer=!0;let m;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");m=n.getContextAttributes().alpha}else m=a;const _=f,p=new Set([Lo,Io,Po]),g=new Set([sn,qn,js,ts,Co,Ro]),v=new Uint32Array(4),M=new Int32Array(4),x=new L;let b=null,S=null;const T=[],y=[];let A=null;this.domElement=e,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=Yn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const E=this;let P=!1,D=null,N=null,R=null,B=null;this._outputColorSpace=Fe;let V=0,Y=0,it=null,Z=-1,j=null;const ct=new ue,xt=new ue;let _t=null;const kt=new pt(0);let zt=0,Dt=e.width,st=e.height,rt=1,Mt=null,Lt=null;const yt=new ue(0,0,Dt,st),Bt=new ue(0,0,Dt,st);let _e=!1;const Gt=new Vl;let Vt=!1,Kt=!1;const Ht=new It,ee=new L,fe=new ue,Le={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let jt=!1;function se(){return it===null?rt:1}let H=n;function Ce(C,G){return e.getContext(C,G)}let Yt,U,w,q,K,ot,k,$,X,nt,mt,z,O,W,Q,dt,ht,I,lt,J,gt,vt,ut;try{const C={alpha:!0,depth:i,stencil:s,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:d};if("setAttribute"in e&&e.setAttribute("data-engine","three.js r186"),e.addEventListener("webglcontextlost",de,!1),e.addEventListener("webglcontextrestored",oe,!1),e.addEventListener("webglcontextcreationerror",pn,!1),H===null){const G="webgl2";if(H=Ce(G,C),H===null)throw Ce(G)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}St()}catch(C){throw e.removeEventListener("webglcontextlost",de,!1),e.removeEventListener("webglcontextrestored",oe,!1),e.removeEventListener("webglcontextcreationerror",pn,!1),Ot("WebGLRenderer: "+C.message),C}function St(){Yt=new Ex(H),Yt.init(),gt=new v_(H,Yt),U=new xx(H,Yt,t,gt),w=new g_(H,Yt),U.reversedDepthBuffer&&u&&w.buffers.depth.setReversed(!0),N=H.createFramebuffer(),R=H.createFramebuffer(),B=H.createFramebuffer(),q=new Px(H),K=new n_,ot=new x_(H,Yt,w,K,U,gt,q),k=new Tx(E),$=new f0(H),vt=new mx(H,$),X=new Cx(H,$,q,vt),nt=new Lx(H,X,$,vt,q),I=new Ix(H,U,ot),Q=new vx(K),mt=new e_(E,k,Yt,U,vt,Q),z=new w_(E,K),O=new s_,W=new h_(Yt),ht=new px(E,k,w,nt,m,l),dt=new m_(E,nt,U),ut=new A_(H,q,U,w),lt=new gx(H,Yt,q),J=new Rx(H,Yt,q),q.programs=mt.programs,E.capabilities=U,E.extensions=Yt,E.properties=K,E.renderLists=O,E.shadowMap=dt,E.state=w,E.info=q}_!==sn&&(A=new Ux(_,e.width,e.height,o,i,s));const wt=new S_(E,H);this.xr=wt,this.getContext=function(){return H},this.getContextAttributes=function(){return H.getContextAttributes()},this.forceContextLoss=function(){const C=Yt.get("WEBGL_lose_context");C&&C.loseContext()},this.forceContextRestore=function(){const C=Yt.get("WEBGL_lose_context");C&&C.restoreContext()},this.getPixelRatio=function(){return rt},this.setPixelRatio=function(C){C!==void 0&&(rt=C,this.setSize(Dt,st,!1))},this.getSize=function(C){return C.set(Dt,st)},this.setSize=function(C,G,at=!0){if(wt.isPresenting){Nt("WebGLRenderer: Can't change size while VR device is presenting.");return}Dt=C,st=G,e.width=Math.floor(C*rt),e.height=Math.floor(G*rt),at===!0&&(e.style.width=C+"px",e.style.height=G+"px"),A!==null&&A.setSize(e.width,e.height),this.setViewport(0,0,C,G)},this.getDrawingBufferSize=function(C){return C.set(Dt*rt,st*rt).floor()},this.setDrawingBufferSize=function(C,G,at){Dt=C,st=G,rt=at,e.width=Math.floor(C*at),e.height=Math.floor(G*at),this.setViewport(0,0,C,G)},this.setEffects=function(C){if(_===sn){Ot("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(C){for(let G=0;G<C.length;G++)if(C[G].isOutputPass===!0){Nt("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}A.setEffects(C||[])},this.getCurrentViewport=function(C){return C.copy(ct)},this.getViewport=function(C){return C.copy(yt)},this.setViewport=function(C,G,at,tt){C.isVector4?yt.set(C.x,C.y,C.z,C.w):yt.set(C,G,at,tt),w.viewport(ct.copy(yt).multiplyScalar(rt).round())},this.getScissor=function(C){return C.copy(Bt)},this.setScissor=function(C,G,at,tt){C.isVector4?Bt.set(C.x,C.y,C.z,C.w):Bt.set(C,G,at,tt),w.scissor(xt.copy(Bt).multiplyScalar(rt).round())},this.getScissorTest=function(){return _e},this.setScissorTest=function(C){w.setScissorTest(_e=C)},this.setOpaqueSort=function(C){Mt=C},this.setTransparentSort=function(C){Lt=C},this.getClearColor=function(C){return C.copy(ht.getClearColor())},this.setClearColor=function(){ht.setClearColor(...arguments)},this.getClearAlpha=function(){return ht.getClearAlpha()},this.setClearAlpha=function(){ht.setClearAlpha(...arguments)},this.clear=function(C=!0,G=!0,at=!0){let tt=0;if(C){let et=!1;if(it!==null){const Tt=it.texture.format;et=p.has(Tt)}if(et){const Tt=it.texture.type,Ct=g.has(Tt),At=ht.getClearColor(),Rt=ht.getClearAlpha(),Ut=At.r,Jt=At.g,ne=At.b;Ct?(v[0]=Ut,v[1]=Jt,v[2]=ne,v[3]=Rt,H.clearBufferuiv(H.COLOR,0,v)):(M[0]=Ut,M[1]=Jt,M[2]=ne,M[3]=Rt,H.clearBufferiv(H.COLOR,0,M))}else tt|=H.COLOR_BUFFER_BIT}G&&(tt|=H.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),at&&(tt|=H.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),tt!==0&&H.clear(tt)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(C){C.setRenderer(this),D=C},this.dispose=function(){e.removeEventListener("webglcontextlost",de,!1),e.removeEventListener("webglcontextrestored",oe,!1),e.removeEventListener("webglcontextcreationerror",pn,!1),ht.dispose(),O.dispose(),W.dispose(),K.dispose(),k.dispose(),nt.dispose(),vt.dispose(),ut.dispose(),mt.dispose(),wt.dispose(),wt.removeEventListener("sessionstart",In),wt.removeEventListener("sessionend",Ln),Dn.stop()};function de(C){C.preventDefault(),ia("WebGLRenderer: Context Lost."),P=!0}function oe(){ia("WebGLRenderer: Context Restored."),P=!1;const C=q.autoReset,G=dt.enabled,at=dt.autoUpdate,tt=dt.needsUpdate,et=dt.type;St(),q.autoReset=C,dt.enabled=G,dt.autoUpdate=at,dt.needsUpdate=tt,dt.type=et}function pn(C){Ot("WebGLRenderer: A WebGL context could not be created. Reason: ",C.statusMessage)}function mn(C){const G=C.target;G.removeEventListener("dispose",mn),lo(G)}function lo(C){jc(C),K.remove(C)}function jc(C){const G=K.get(C).programs;G!==void 0&&(G.forEach(function(at){mt.releaseProgram(at)}),C.isShaderMaterial&&mt.releaseShaderCache(C))}this.renderBufferDirect=function(C,G,at,tt,et,Tt){G===null&&(G=Le);const Ct=et.isMesh&&et.matrixWorld.determinantAffine()<0,At=TS(C,G,at,tt,et);w.setMaterial(tt,Ct);let Rt=at.index,Ut=1;if(tt.wireframe===!0){if(Rt=X.getWireframeAttribute(at),Rt===void 0)return;Ut=2}const Jt=at.drawRange,ne=at.attributes.position;let Pt=Jt.start*Ut,pe=(Jt.start+Jt.count)*Ut;Tt!==null&&(Pt=Math.max(Pt,Tt.start*Ut),pe=Math.min(pe,(Tt.start+Tt.count)*Ut)),Rt!==null?(Pt=Math.max(Pt,0),pe=Math.min(pe,Rt.count)):ne!=null&&(Pt=Math.max(Pt,0),pe=Math.min(pe,ne.count));const Ve=pe-Pt;if(Ve<0||Ve===1/0)return;vt.setup(et,tt,At,at,Rt);let Ee,be=lt;if(Rt!==null&&(Ee=$.get(Rt),be=J,be.setIndex(Ee)),et.isMesh)tt.wireframe===!0?(w.setLineWidth(tt.wireframeLinewidth*se()),be.setMode(H.LINES)):be.setMode(H.TRIANGLES);else if(et.isLine){let en=tt.linewidth;en===void 0&&(en=1),w.setLineWidth(en*se()),et.isLineSegments?be.setMode(H.LINES):et.isLineLoop?be.setMode(H.LINE_LOOP):be.setMode(H.LINE_STRIP)}else et.isPoints?be.setMode(H.POINTS):et.isSprite&&be.setMode(H.TRIANGLES);if(et.isBatchedMesh)if(Yt.get("WEBGL_multi_draw"))be.renderMultiDraw(et._multiDrawStarts,et._multiDrawCounts,et._multiDrawCount);else{const en=et._multiDrawStarts,Et=et._multiDrawCounts,ln=et._multiDrawCount,re=Rt?$.get(Rt).bytesPerElement:1,Un=K.get(tt).currentProgram.getUniforms();for(let ai=0;ai<ln;ai++)Un.setValue(H,"_gl_DrawID",ai),be.render(en[ai]/re,Et[ai])}else if(et.isInstancedMesh)be.renderInstances(Pt,Ve,et.count);else if(at.isInstancedBufferGeometry){const en=at._maxInstanceCount!==void 0?at._maxInstanceCount:1/0,Et=Math.min(at.instanceCount,en);be.renderInstances(Pt,Ve,Et)}else be.render(Pt,Ve)};function Vs(C,G,at,tt){D!==null&&C.isNodeMaterial&&D.setObject(tt,C),Vt===!0&&Q.setState(C,at,!1),C.transparent===!0&&C.side===qe&&C.forceSinglePass===!1?(C.side=nn,C.needsUpdate=!0,ri(C,G,tt),C.side=Mi,C.needsUpdate=!0,ri(C,G,tt),C.side=qe):ri(C,G,tt)}this.compile=function(C,G,at=null){at===null&&(at=C),D!==null&&D.renderStart(C,G,at),S=W.get(at),S.init(G),y.push(S),at.traverseVisible(function(et){et.isLight&&et.layers.test(G.layers)&&(S.pushLight(et),et.castShadow&&S.pushShadow(et))}),C!==at&&C.traverseVisible(function(et){et.isLight&&et.layers.test(G.layers)&&(S.pushLight(et),et.castShadow&&S.pushShadow(et))}),S.setupLights(),D!==null&&D.updateLights(S.state.lightsArray),Kt=this.localClippingEnabled,Vt=Q.init(this.clippingPlanes,Kt),Vt===!0&&Q.setGlobalState(this.clippingPlanes,G),D!==null&&dt.render(S.state.shadowsArray,at,G);const tt=new Set;return C.traverse(function(et){if(!(et.isMesh||et.isPoints||et.isLine||et.isSprite))return;const Tt=et.material;if(Tt)if(Array.isArray(Tt))for(let Ct=0;Ct<Tt.length;Ct++){const At=Tt[Ct];Vs(At,at,G,et),tt.add(At)}else Vs(Tt,at,G,et),tt.add(Tt)}),S=y.pop(),D!==null&&D.renderEnd(),tt},this.compileAsync=function(C,G,at=null){const tt=this.compile(C,G,at);return new Promise(et=>{function Tt(){if(tt.forEach(function(Ct){const Rt=K.get(Ct).currentProgram;(Rt===void 0||Rt.isReady())&&tt.delete(Ct)}),tt.size===0){et(C);return}setTimeout(Tt,10)}Yt.get("KHR_parallel_shader_compile")!==null?Tt():setTimeout(Tt,10)})};let Hr=null;function Me(C){Hr&&Hr(C)}function In(){Dn.stop()}function Ln(){Dn.start()}const Dn=new Ku;Dn.setAnimationLoop(Me),typeof self<"u"&&Dn.setContext(self),this.setAnimationLoop=function(C){Hr=C,wt.setAnimationLoop(C),C===null?Dn.stop():Dn.start()},wt.addEventListener("sessionstart",In),wt.addEventListener("sessionend",Ln),this.render=function(C,G){if(G!==void 0&&G.isCamera!==!0){Ot("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(P===!0)return;D!==null&&D.renderStart(C,G);const at=wt.enabled===!0&&wt.isPresenting===!0,tt=A!==null&&(it===null||at)&&A.begin(E,it);if(C.matrixWorldAutoUpdate===!0&&C.updateMatrixWorld(),G.parent===null&&G.matrixWorldAutoUpdate===!0&&G.updateMatrixWorld(),wt.enabled===!0&&wt.isPresenting===!0&&(A===null||A.isCompositing()===!1)&&(wt.cameraAutoUpdate===!0&&wt.updateCamera(G),G=wt.getCamera()),C.isScene===!0&&C.onBeforeRender(E,C,G,it),S=W.get(C,y.length),S.init(G),S.state.textureUnits=ot.getTextureUnits(),y.push(S),Ht.multiplyMatrices(G.projectionMatrix,G.matrixWorldInverse),Gt.setFromProjectionMatrix(Ht,Zn,G.reversedDepth),Kt=this.localClippingEnabled,Vt=Q.init(this.clippingPlanes,Kt),b=O.get(C,T.length),b.init(),T.push(b),wt.enabled===!0&&wt.isPresenting===!0){const Ct=E.xr.getDepthSensingMesh();Ct!==null&&_i(Ct,G,-1/0,E.sortObjects)}_i(C,G,0,E.sortObjects),b.finish(),D!==null&&D.updateLights(S.state.lightsArray),E.sortObjects===!0&&b.sort(Mt,Lt),jt=wt.enabled===!1||wt.isPresenting===!1||wt.hasDepthSensing()===!1,jt&&ht.addToRenderList(b,C),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),Vt===!0&&Q.beginShadows();const et=S.state.shadowsArray;if(dt.render(et,C,G),Vt===!0&&Q.endShadows(),(tt&&A.hasRenderPass())===!1){const Ct=b.opaque,At=b.transmissive;if(S.setupLights(),G.isArrayCamera){const Rt=G.cameras;if(At.length>0)for(let Ut=0,Jt=Rt.length;Ut<Jt;Ut++){const ne=Rt[Ut];Gs(Ct,At,C,ne)}jt&&ht.render(C);for(let Ut=0,Jt=Rt.length;Ut<Jt;Ut++){const ne=Rt[Ut];Hs(b,C,ne,ne.viewport)}}else At.length>0&&Gs(Ct,At,C,G),jt&&ht.render(C),Hs(b,C,G)}it!==null&&Y===0&&(ot.updateMultisampleRenderTarget(it),ot.updateRenderTargetMipmap(it)),tt&&A.end(E),C.isScene===!0&&C.onAfterRender(E,C,G),vt.resetDefaultState(),Z=-1,j=null,y.pop(),y.length>0?(S=y[y.length-1],ot.setTextureUnits(S.state.textureUnits),Vt===!0&&Q.setGlobalState(E.clippingPlanes,S.state.camera)):S=null,T.pop(),T.length>0?b=T[T.length-1]:b=null,D!==null&&D.renderEnd()};function _i(C,G,at,tt){if(C.visible===!1)return;if(C.layers.test(G.layers)){if(C.isGroup)at=C.renderOrder;else if(C.isLOD)C.autoUpdate===!0&&C.update(G);else if(C.isLightProbeGrid)S.pushLightProbeGrid(C);else if(C.isLight)S.pushLight(C),C.castShadow&&S.pushShadow(C);else if(C.isSprite){if(!C.frustumCulled||C.intersectsFrustum(Gt)){tt&&fe.setFromMatrixPosition(C.matrixWorld).applyMatrix4(Ht);const Ct=nt.update(C),At=C.material;At.visible&&b.push(C,Ct,At,at,fe.z,null,G)}}else if((C.isMesh||C.isLine||C.isPoints)&&(!C.frustumCulled||C.intersectsFrustum(Gt))){const Ct=nt.update(C),At=C.material;if(tt&&(C.boundingSphere!==void 0?(C.boundingSphere===null&&C.computeBoundingSphere(),fe.copy(C.boundingSphere.center)):(Ct.boundingSphere===null&&Ct.computeBoundingSphere(),fe.copy(Ct.boundingSphere.center)),fe.applyMatrix4(C.matrixWorld).applyMatrix4(Ht)),Array.isArray(At)){const Rt=Ct.groups;for(let Ut=0,Jt=Rt.length;Ut<Jt;Ut++){const ne=Rt[Ut],Pt=At[ne.materialIndex];Pt&&Pt.visible&&b.push(C,Ct,Pt,at,fe.z,ne,G)}}else At.visible&&b.push(C,Ct,At,at,fe.z,null,G)}}const Tt=C.children;for(let Ct=0,At=Tt.length;Ct<At;Ct++)_i(Tt[Ct],G,at,tt)}function Hs(C,G,at,tt){const{opaque:et,transmissive:Tt,transparent:Ct}=C;S.setupLightsView(at),Vt===!0&&Q.setGlobalState(E.clippingPlanes,at),tt&&w.viewport(ct.copy(tt)),et.length>0&&Ki(et,G,at),Tt.length>0&&Ki(Tt,G,at),Ct.length>0&&Ki(Ct,G,at),w.buffers.depth.setTest(!0),w.buffers.depth.setMask(!0),w.buffers.color.setMask(!0),w.setPolygonOffset(!1)}function Gs(C,G,at,tt){if((at.isScene===!0?at.overrideMaterial:null)!==null)return;if(S.state.transmissionRenderTarget[tt.id]===void 0){const Pt=Yt.has("EXT_color_buffer_half_float")||Yt.has("EXT_color_buffer_float");S.state.transmissionRenderTarget[tt.id]=new $e(1,1,{generateMipmaps:!0,type:Pt?Je:sn,minFilter:oi,samples:Math.max(4,U.samples),stencilBuffer:s,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:Qt.workingColorSpace})}const Tt=S.state.transmissionRenderTarget[tt.id],Ct=tt.viewport||ct;Tt.setSize(Ct.z*E.transmissionResolutionScale,Ct.w*E.transmissionResolutionScale);const At=E.getRenderTarget(),Rt=E.getActiveCubeFace(),Ut=E.getActiveMipmapLevel();E.setRenderTarget(Tt),E.getClearColor(kt),zt=E.getClearAlpha(),zt<1&&E.setClearColor(16777215,.5),E.clear(),jt&&ht.render(at);const Jt=E.toneMapping;E.toneMapping=Yn;const ne=tt.viewport;if(tt.viewport!==void 0&&(tt.viewport=void 0),S.setupLightsView(tt),Vt===!0&&Q.setGlobalState(E.clippingPlanes,tt),Ki(C,at,tt),ot.updateMultisampleRenderTarget(Tt),ot.updateRenderTargetMipmap(Tt),Yt.has("WEBGL_multisampled_render_to_texture")===!1){let Pt=!1;for(let pe=0,Ve=G.length;pe<Ve;pe++){const Ee=G[pe],{object:be,geometry:en,material:Et,group:ln}=Ee;if(Et.side===qe&&be.layers.test(tt.layers)){const re=Et.side;Et.side=nn,Et.needsUpdate=!0,Gr(be,at,tt,en,Et,ln),Et.side=re,Et.needsUpdate=!0,Pt=!0}}Pt===!0&&(ot.updateMultisampleRenderTarget(Tt),ot.updateRenderTargetMipmap(Tt))}E.setRenderTarget(At,Rt,Ut),E.setClearColor(kt,zt),ne!==void 0&&(tt.viewport=ne),E.toneMapping=Jt}function Ki(C,G,at){const tt=G.isScene===!0?G.overrideMaterial:null;for(let et=0,Tt=C.length;et<Tt;et++){const Ct=C[et],{object:At,geometry:Rt,group:Ut}=Ct;let Jt=Ct.material;Jt.allowOverride===!0&&tt!==null&&(Jt=tt),At.layers.test(at.layers)&&Gr(At,G,at,Rt,Jt,Ut)}}function Gr(C,G,at,tt,et,Tt){D!==null&&et.isNodeMaterial&&D.setObject(C,et),C.onBeforeRender(E,G,at,tt,et,Tt),C.modelViewMatrix.multiplyMatrices(at.matrixWorldInverse,C.matrixWorld),C.normalMatrix.getNormalMatrix(C.modelViewMatrix),et.onBeforeRender(E,G,at,tt,C,Tt),et.transparent===!0&&et.side===qe&&et.forceSinglePass===!1?(et.side=nn,et.needsUpdate=!0,E.renderBufferDirect(at,G,tt,et,C,Tt),et.side=Mi,et.needsUpdate=!0,E.renderBufferDirect(at,G,tt,et,C,Tt),et.side=qe):E.renderBufferDirect(at,G,tt,et,C,Tt),C.onAfterRender(E,G,at,tt,et,Tt)}function ri(C,G,at){G.isScene!==!0&&(G=Le);const tt=K.get(C),et=S.state.lights,Tt=S.state.shadowsArray,Ct=et.state.version,At=mt.getParameters(C,et.state,Tt,G,at,S.state.lightProbeGridArray),Rt=mt.getProgramCacheKey(At);let Ut=tt.programs;tt.environment=C.isMeshStandardMaterial||C.isMeshLambertMaterial||C.isMeshPhongMaterial?G.environment:null,tt.fog=G.fog;const Jt=C.isMeshStandardMaterial||C.isMeshLambertMaterial&&!C.envMap||C.isMeshPhongMaterial&&!C.envMap;tt.envMap=k.get(C.envMap||tt.environment,Jt),tt.envMapRotation=tt.environment!==null&&C.envMap===null?G.environmentRotation:C.envMapRotation,Ut===void 0&&(C.addEventListener("dispose",mn),Ut=new Map,tt.programs=Ut);let ne=Ut.get(Rt);if(ne!==void 0){if(tt.currentProgram===ne&&tt.lightsStateVersion===Ct)return md(C,At),ne}else At.uniforms=mt.getUniforms(C),D!==null&&C.isNodeMaterial&&D.build(C,at,At),C.onBeforeCompile(At,E),ne=mt.acquireProgram(At,Rt),Ut.set(Rt,ne),tt.uniforms=At.uniforms;const Pt=tt.uniforms;return(!C.isShaderMaterial&&!C.isRawShaderMaterial||C.clipping===!0)&&(Pt.clippingPlanes=Q.uniform),md(C,At),tt.needsLights=CS(C),tt.lightsStateVersion=Ct,tt.needsLights&&(Pt.ambientLightColor.value=et.state.ambient,Pt.lightProbe.value=et.state.probe,Pt.sunLights.value=et.state.sun,Pt.sunLightShadows.value=et.state.sunShadow,Pt.directionalLights.value=et.state.directional,Pt.directionalLightShadows.value=et.state.directionalShadow,Pt.spotLights.value=et.state.spot,Pt.spotLightShadows.value=et.state.spotShadow,Pt.rectAreaLights.value=et.state.rectArea,Pt.ltc_1.value=et.state.rectAreaLTC1,Pt.ltc_2.value=et.state.rectAreaLTC2,Pt.pointLights.value=et.state.point,Pt.pointLightShadows.value=et.state.pointShadow,Pt.hemisphereLights.value=et.state.hemi,Pt.sunShadowMatrix.value=et.state.sunShadowMatrix,Pt.sunShadowCascade.value=et.state.sunShadowCascade,Pt.directionalShadowMatrix.value=et.state.directionalShadowMatrix,Pt.spotLightMatrix.value=et.state.spotLightMatrix,Pt.spotLightMap.value=et.state.spotLightMap,Pt.pointShadowMatrix.value=et.state.pointShadowMatrix),tt.lightProbeGrid=S.state.lightProbeGridArray.length>0,tt.currentProgram=ne,tt.uniformsList=null,ne}function Ws(C){if(C.uniformsList===null){const G=C.currentProgram.getUniforms();C.uniformsList=Ya.seqWithValue(G.seq,C.uniforms)}return C.uniformsList}function md(C,G){const at=K.get(C);at.outputColorSpace=G.outputColorSpace,at.batching=G.batching,at.batchingColor=G.batchingColor,at.instancing=G.instancing,at.instancingColor=G.instancingColor,at.instancingMorph=G.instancingMorph,at.skinning=G.skinning,at.morphTargets=G.morphTargets,at.morphNormals=G.morphNormals,at.morphColors=G.morphColors,at.morphTargetsCount=G.morphTargetsCount,at.numClippingPlanes=G.numClippingPlanes,at.numIntersection=G.numClipIntersection,at.vertexAlphas=G.vertexAlphas,at.vertexTangents=G.vertexTangents,at.toneMapping=G.toneMapping}function AS(C,G){if(C.length===0)return null;if(C.length===1)return C[0].texture!==null?C[0]:null;x.setFromMatrixPosition(G.matrixWorld);for(let at=0,tt=C.length;at<tt;at++){const et=C[at];if(et.texture!==null&&et.boundingBox.containsPoint(x))return et}return null}function TS(C,G,at,tt,et){G.isScene!==!0&&(G=Le),ot.resetTextureUnits();const Tt=G.fog,Ct=tt.isMeshStandardMaterial||tt.isMeshLambertMaterial||tt.isMeshPhongMaterial?G.environment:null,At=it===null?E.outputColorSpace:it.isXRRenderTarget===!0?it.texture.colorSpace:Qt.workingColorSpace,Rt=tt.isMeshStandardMaterial||tt.isMeshLambertMaterial&&!tt.envMap||tt.isMeshPhongMaterial&&!tt.envMap,Ut=k.get(tt.envMap||Ct,Rt),Jt=tt.vertexColors===!0&&!!at.attributes.color&&at.attributes.color.itemSize===4,ne=!!at.attributes.tangent&&(!!tt.normalMap||tt.anisotropy>0),Pt=!!at.morphAttributes.position,pe=!!at.morphAttributes.normal,Ve=!!at.morphAttributes.color;let Ee=Yn;tt.toneMapped&&(it===null||it.isXRRenderTarget===!0)&&(Ee=E.toneMapping);const be=at.morphAttributes.position||at.morphAttributes.normal||at.morphAttributes.color,en=be!==void 0?be.length:0,Et=K.get(tt),ln=S.state.lights;if(Vt===!0&&(Kt===!0||C!==j)){const we=C===j&&tt.id===Z;Q.setState(tt,C,we)}let re=!1;tt.version===Et.__version?(Et.needsLights&&Et.lightsStateVersion!==ln.state.version||Et.outputColorSpace!==At||et.isBatchedMesh&&Et.batching===!1||!et.isBatchedMesh&&Et.batching===!0||et.isBatchedMesh&&Et.batchingColor===!0&&et._colorsTexture===null||et.isBatchedMesh&&Et.batchingColor===!1&&et._colorsTexture!==null||et.isInstancedMesh&&Et.instancing===!1||!et.isInstancedMesh&&Et.instancing===!0||et.isSkinnedMesh&&Et.skinning===!1||!et.isSkinnedMesh&&Et.skinning===!0||et.isInstancedMesh&&Et.instancingColor===!0&&et.instanceColor===null||et.isInstancedMesh&&Et.instancingColor===!1&&et.instanceColor!==null||et.isInstancedMesh&&Et.instancingMorph===!0&&et.morphTexture===null||et.isInstancedMesh&&Et.instancingMorph===!1&&et.morphTexture!==null||Et.envMap!==Ut||tt.fog===!0&&Et.fog!==Tt||Et.numClippingPlanes!==void 0&&(Et.numClippingPlanes!==Q.numPlanes||Et.numIntersection!==Q.numIntersection)||Et.vertexAlphas!==Jt||Et.vertexTangents!==ne||Et.morphTargets!==Pt||Et.morphNormals!==pe||Et.morphColors!==Ve||Et.toneMapping!==Ee||Et.morphTargetsCount!==en||!!Et.lightProbeGrid!=S.state.lightProbeGridArray.length>0)&&(re=!0):(re=!0,Et.__version=tt.version);let Un=Et.currentProgram;re===!0&&(Un=ri(tt,G,et),D&&tt.isNodeMaterial&&D.onUpdateProgram(tt,Un,Et));let ai=!1,Di=!1,Xs=!1;const ye=Un.getUniforms(),Be=Et.uniforms;if(w.useProgram(Un.program)&&(ai=!0,Di=!0,Xs=!0),tt.id!==Z&&(Z=tt.id,Di=!0),Et.needsLights){const we=AS(S.state.lightProbeGridArray,et);Et.lightProbeGrid!==we&&(Et.lightProbeGrid=we,Di=!0)}if(ai||j!==C){w.buffers.depth.getReversed()&&C.reversedDepth!==!0&&(C._reversedDepth=!0,C.updateProjectionMatrix()),ye.setValue(H,"projectionMatrix",C.projectionMatrix),ye.setValue(H,"viewMatrix",C.matrixWorldInverse);const Ni=ye.map.cameraPosition;Ni!==void 0&&Ni.setValue(H,ee.setFromMatrixPosition(C.matrixWorld)),U.logarithmicDepthBuffer&&ye.setValue(H,"logDepthBufFC",2/(Math.log(C.far+1)/Math.LN2)),(tt.isMeshPhongMaterial||tt.isMeshToonMaterial||tt.isMeshLambertMaterial||tt.isMeshBasicMaterial||tt.isMeshStandardMaterial||tt.isShaderMaterial)&&ye.setValue(H,"isOrthographic",C.isOrthographicCamera===!0),j!==C&&(j=C,Di=!0,Xs=!0)}if(Et.needsLights&&(ln.state.sunShadowMap.length>0&&ye.setValue(H,"sunShadowMap",ln.state.sunShadowMap,ot),ln.state.directionalShadowMap.length>0&&ye.setValue(H,"directionalShadowMap",ln.state.directionalShadowMap,ot),ln.state.spotShadowMap.length>0&&ye.setValue(H,"spotShadowMap",ln.state.spotShadowMap,ot),ln.state.pointShadowMap.length>0&&ye.setValue(H,"pointShadowMap",ln.state.pointShadowMap,ot)),et.isSkinnedMesh){ye.setOptional(H,et,"bindMatrix"),ye.setOptional(H,et,"bindMatrixInverse");const we=et.skeleton;we&&(we.boneTexture===null&&we.computeBoneTexture(),ye.setValue(H,"boneTexture",we.boneTexture,ot))}et.isBatchedMesh&&(ye.setOptional(H,et,"batchingTexture"),ye.setValue(H,"batchingTexture",et._matricesTexture,ot),ye.setOptional(H,et,"batchingIdTexture"),ye.setValue(H,"batchingIdTexture",et._indirectTexture,ot),ye.setOptional(H,et,"batchingColorTexture"),et._colorsTexture!==null&&ye.setValue(H,"batchingColorTexture",et._colorsTexture,ot));const Ui=at.morphAttributes;if((Ui.position!==void 0||Ui.normal!==void 0||Ui.color!==void 0)&&I.update(et,at,Un),(Di||Et.receiveShadow!==et.receiveShadow)&&(Et.receiveShadow=et.receiveShadow,ye.setValue(H,"receiveShadow",et.receiveShadow)),(tt.isMeshStandardMaterial||tt.isMeshLambertMaterial||tt.isMeshPhongMaterial)&&tt.envMap===null&&G.environment!==null&&(Be.envMapIntensity.value=G.environmentIntensity),Be.dfgLUT!==void 0&&(Be.dfgLUT.value=E_()),Di){if(ye.setValue(H,"toneMappingExposure",E.toneMappingExposure),Et.needsLights&&ES(Be,Xs),Tt&&tt.fog===!0&&z.refreshFogUniforms(Be,Tt),z.refreshMaterialUniforms(Be,tt,rt,st,S.state.transmissionRenderTarget[C.id]),Et.needsLights&&Et.lightProbeGrid){const we=Et.lightProbeGrid;Be.probesSH.value=we.texture,Be.probesMin.value.copy(we.boundingBox.min),Be.probesMax.value.copy(we.boundingBox.max),Be.probesResolution.value.copy(we.resolution)}Ya.upload(H,Ws(Et),Be,ot)}if(tt.isShaderMaterial&&tt.uniformsNeedUpdate===!0&&(Ya.upload(H,Ws(Et),Be,ot),tt.uniformsNeedUpdate=!1),tt.isSpriteMaterial&&ye.setValue(H,"center",et.center),ye.setValue(H,"modelViewMatrix",et.modelViewMatrix),ye.setValue(H,"normalMatrix",et.normalMatrix),ye.setValue(H,"modelMatrix",et.matrixWorld),tt.uniformsGroups!==void 0){const we=tt.uniformsGroups;for(let Ni=0,Ys=we.length;Ni<Ys;Ni++){const xd=we[Ni];ut.update(xd,Un),ut.bind(xd,Un)}}return Un}function ES(C,G){C.ambientLightColor.needsUpdate=G,C.lightProbe.needsUpdate=G,C.sunLights.needsUpdate=G,C.sunLightShadows.needsUpdate=G,C.directionalLights.needsUpdate=G,C.directionalLightShadows.needsUpdate=G,C.pointLights.needsUpdate=G,C.pointLightShadows.needsUpdate=G,C.spotLights.needsUpdate=G,C.spotLightShadows.needsUpdate=G,C.rectAreaLights.needsUpdate=G,C.hemisphereLights.needsUpdate=G}function CS(C){return C.isMeshLambertMaterial||C.isMeshToonMaterial||C.isMeshPhongMaterial||C.isMeshStandardMaterial||C.isShadowMaterial||C.isShaderMaterial&&C.lights===!0}this.getActiveCubeFace=function(){return V},this.getActiveMipmapLevel=function(){return Y},this.getRenderTarget=function(){return it},this.setRenderTargetTextures=function(C,G,at){const tt=K.get(C);tt.__autoAllocateDepthBuffer=C.resolveDepthBuffer===!1,tt.__autoAllocateDepthBuffer===!1&&(tt.__useRenderToTexture=!1),K.get(C.texture).__webglTexture=G,K.get(C.depthTexture).__webglTexture=tt.__autoAllocateDepthBuffer?void 0:at,tt.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(C,G){const at=K.get(C);at.__webglFramebuffer=G,at.__useDefaultFramebuffer=G===void 0},this.setRenderTarget=function(C,G=0,at=0){it=C,V=G,Y=at;let tt=null,et=!1,Tt=!1;if(C){const At=K.get(C);if(At.__useDefaultFramebuffer!==void 0){w.bindFramebuffer(H.FRAMEBUFFER,At.__webglFramebuffer),ct.copy(C.viewport),xt.copy(C.scissor),_t=C.scissorTest,w.viewport(ct),w.scissor(xt),w.setScissorTest(_t),Z=-1;return}else if(At.__webglFramebuffer===void 0)ot.setupRenderTarget(C);else if(At.__hasExternalTextures)ot.rebindTextures(C,K.get(C.texture).__webglTexture,K.get(C.depthTexture).__webglTexture);else if(C.depthBuffer){const Jt=C.depthTexture;if(At.__boundDepthTexture!==Jt){if(Jt!==null&&K.has(Jt)&&(C.width!==Jt.image.width||C.height!==Jt.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");ot.setupDepthRenderbuffer(C)}}const Rt=C.texture;(Rt.isData3DTexture||Rt.isDataArrayTexture||Rt.isCompressedArrayTexture)&&(Tt=!0);const Ut=K.get(C).__webglFramebuffer;C.isWebGLCubeRenderTarget?(Array.isArray(Ut[G])?tt=Ut[G][at]:tt=Ut[G],et=!0):C.samples>0&&ot.useMultisampledRTT(C)===!1?tt=K.get(C).__webglMultisampledFramebuffer:Array.isArray(Ut)?tt=Ut[at]:tt=Ut,ct.copy(C.viewport),xt.copy(C.scissor),_t=C.scissorTest}else ct.copy(yt).multiplyScalar(rt).floor(),xt.copy(Bt).multiplyScalar(rt).floor(),_t=_e;if(at!==0&&(tt=N),w.bindFramebuffer(H.FRAMEBUFFER,tt)&&w.drawBuffers(C,tt),w.viewport(ct),w.scissor(xt),w.setScissorTest(_t),et){const At=K.get(C.texture);H.framebufferTexture2D(H.FRAMEBUFFER,H.COLOR_ATTACHMENT0,H.TEXTURE_CUBE_MAP_POSITIVE_X+G,At.__webglTexture,at)}else if(Tt){const At=G;for(let Rt=0;Rt<C.textures.length;Rt++){const Ut=K.get(C.textures[Rt]);H.framebufferTextureLayer(H.FRAMEBUFFER,H.COLOR_ATTACHMENT0+Rt,Ut.__webglTexture,at,At)}}else if(C!==null&&at!==0){const At=K.get(C.texture);H.framebufferTexture2D(H.FRAMEBUFFER,H.COLOR_ATTACHMENT0,H.TEXTURE_2D,At.__webglTexture,at)}Z=-1};function gd(C){const G=K.get(C);return(G.__readFormat!==C.format||G.__readType!==C.type)&&(G.__readFormat=C.format,G.__readType=C.type,G.__formatReadable=U.textureFormatReadable(C.format),G.__typeReadable=U.textureTypeReadable(C.type)),G}this.readRenderTargetPixels=function(C,G,at,tt,et,Tt,Ct,At=0){if(!(C&&C.isWebGLRenderTarget)){Ot("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Rt=K.get(C).__webglFramebuffer;if(C.isWebGLCubeRenderTarget&&Ct!==void 0&&(Rt=Rt[Ct]),Rt){w.bindFramebuffer(H.FRAMEBUFFER,Rt);try{const Ut=C.textures[At],Jt=Ut.format,ne=Ut.type;C.textures.length>1&&H.readBuffer(H.COLOR_ATTACHMENT0+At);const Pt=gd(Ut);if(Pt.__formatReadable===!1){Ot("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(Pt.__typeReadable===!1){Ot("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}G>=0&&G<=C.width-tt&&at>=0&&at<=C.height-et&&H.readPixels(G,at,tt,et,gt.convert(Jt),gt.convert(ne),Tt)}finally{const Ut=it!==null?K.get(it).__webglFramebuffer:null;w.bindFramebuffer(H.FRAMEBUFFER,Ut)}}},this.readRenderTargetPixelsAsync=async function(C,G,at,tt,et,Tt,Ct,At=0){if(!(C&&C.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Rt=K.get(C).__webglFramebuffer;if(C.isWebGLCubeRenderTarget&&Ct!==void 0&&(Rt=Rt[Ct]),Rt)if(G>=0&&G<=C.width-tt&&at>=0&&at<=C.height-et){w.bindFramebuffer(H.FRAMEBUFFER,Rt);const Ut=C.textures[At],Jt=Ut.format,ne=Ut.type;C.textures.length>1&&H.readBuffer(H.COLOR_ATTACHMENT0+At);const Pt=gd(Ut);if(Pt.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(Pt.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const pe=H.createBuffer();H.bindBuffer(H.PIXEL_PACK_BUFFER,pe),H.bufferData(H.PIXEL_PACK_BUFFER,Tt.byteLength,H.STREAM_READ),H.readPixels(G,at,tt,et,gt.convert(Jt),gt.convert(ne),0),H.bindBuffer(H.PIXEL_PACK_BUFFER,null);const Ve=it!==null?K.get(it).__webglFramebuffer:null;w.bindFramebuffer(H.FRAMEBUFFER,Ve);const Ee=H.fenceSync(H.SYNC_GPU_COMMANDS_COMPLETE,0);return H.flush(),await jd(H,Ee,4),H.bindBuffer(H.PIXEL_PACK_BUFFER,pe),H.getBufferSubData(H.PIXEL_PACK_BUFFER,0,Tt),H.bindBuffer(H.PIXEL_PACK_BUFFER,null),H.deleteBuffer(pe),H.deleteSync(Ee),Tt}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(C,G=null,at=0){const tt=Math.pow(2,-at),et=Math.floor(C.image.width*tt),Tt=Math.floor(C.image.height*tt),Ct=G!==null?G.x:0,At=G!==null?G.y:0;ot.setTexture2D(C,0),H.copyTexSubImage2D(H.TEXTURE_2D,at,0,0,Ct,At,et,Tt),w.unbindTexture()},this.copyTextureToTexture=function(C,G,at=null,tt=null,et=0,Tt=0){let Ct,At,Rt,Ut,Jt,ne,Pt,pe,Ve;const Ee=C.isCompressedTexture?C.mipmaps[Tt]:C.image;if(at!==null)Ct=at.max.x-at.min.x,At=at.max.y-at.min.y,Rt=at.isBox3?at.max.z-at.min.z:1,Ut=at.min.x,Jt=at.min.y,ne=at.isBox3?at.min.z:0;else{const Be=Math.pow(2,-et);Ct=Math.floor(Ee.width*Be),At=Math.floor(Ee.height*Be),C.isDataArrayTexture?Rt=Ee.depth:C.isData3DTexture?Rt=Math.floor(Ee.depth*Be):Rt=1,Ut=0,Jt=0,ne=0}tt!==null?(Pt=tt.x,pe=tt.y,Ve=tt.z):(Pt=0,pe=0,Ve=0);const be=gt.convert(G.format),en=gt.convert(G.type);let Et;G.isData3DTexture?(ot.setTexture3D(G,0),Et=H.TEXTURE_3D):G.isDataArrayTexture||G.isCompressedArrayTexture?(ot.setTexture2DArray(G,0),Et=H.TEXTURE_2D_ARRAY):(ot.setTexture2D(G,0),Et=H.TEXTURE_2D),w.activeTexture(H.TEXTURE0),w.pixelStorei(H.UNPACK_FLIP_Y_WEBGL,G.flipY),w.pixelStorei(H.UNPACK_PREMULTIPLY_ALPHA_WEBGL,G.premultiplyAlpha),w.pixelStorei(H.UNPACK_ALIGNMENT,G.unpackAlignment);const ln=w.getParameter(H.UNPACK_ROW_LENGTH),re=w.getParameter(H.UNPACK_IMAGE_HEIGHT),Un=w.getParameter(H.UNPACK_SKIP_PIXELS),ai=w.getParameter(H.UNPACK_SKIP_ROWS),Di=w.getParameter(H.UNPACK_SKIP_IMAGES);w.pixelStorei(H.UNPACK_ROW_LENGTH,Ee.width),w.pixelStorei(H.UNPACK_IMAGE_HEIGHT,Ee.height),w.pixelStorei(H.UNPACK_SKIP_PIXELS,Ut),w.pixelStorei(H.UNPACK_SKIP_ROWS,Jt),w.pixelStorei(H.UNPACK_SKIP_IMAGES,ne);const Xs=C.isDataArrayTexture||C.isData3DTexture,ye=G.isDataArrayTexture||G.isData3DTexture;if(C.isDepthTexture){const Be=K.get(C),Ui=K.get(G),we=K.get(Be.__renderTarget),Ni=K.get(Ui.__renderTarget);w.bindFramebuffer(H.READ_FRAMEBUFFER,we.__webglFramebuffer),w.bindFramebuffer(H.DRAW_FRAMEBUFFER,Ni.__webglFramebuffer);for(let Ys=0;Ys<Rt;Ys++)Xs&&(H.framebufferTextureLayer(H.READ_FRAMEBUFFER,H.COLOR_ATTACHMENT0,K.get(C).__webglTexture,et,ne+Ys),H.framebufferTextureLayer(H.DRAW_FRAMEBUFFER,H.COLOR_ATTACHMENT0,K.get(G).__webglTexture,Tt,Ve+Ys)),H.blitFramebuffer(Ut,Jt,Ct,At,Pt,pe,Ct,At,H.DEPTH_BUFFER_BIT,H.NEAREST);w.bindFramebuffer(H.READ_FRAMEBUFFER,null),w.bindFramebuffer(H.DRAW_FRAMEBUFFER,null)}else if(et!==0||C.isRenderTargetTexture||K.has(C)){const Be=K.get(C),Ui=K.get(G);w.bindFramebuffer(H.READ_FRAMEBUFFER,R),w.bindFramebuffer(H.DRAW_FRAMEBUFFER,B);for(let we=0;we<Rt;we++)Xs?H.framebufferTextureLayer(H.READ_FRAMEBUFFER,H.COLOR_ATTACHMENT0,Be.__webglTexture,et,ne+we):H.framebufferTexture2D(H.READ_FRAMEBUFFER,H.COLOR_ATTACHMENT0,H.TEXTURE_2D,Be.__webglTexture,et),ye?H.framebufferTextureLayer(H.DRAW_FRAMEBUFFER,H.COLOR_ATTACHMENT0,Ui.__webglTexture,Tt,Ve+we):H.framebufferTexture2D(H.DRAW_FRAMEBUFFER,H.COLOR_ATTACHMENT0,H.TEXTURE_2D,Ui.__webglTexture,Tt),et!==0?H.blitFramebuffer(Ut,Jt,Ct,At,Pt,pe,Ct,At,H.COLOR_BUFFER_BIT,H.NEAREST):ye?H.copyTexSubImage3D(Et,Tt,Pt,pe,Ve+we,Ut,Jt,Ct,At):H.copyTexSubImage2D(Et,Tt,Pt,pe,Ut,Jt,Ct,At);w.bindFramebuffer(H.READ_FRAMEBUFFER,null),w.bindFramebuffer(H.DRAW_FRAMEBUFFER,null)}else ye?C.isDataTexture||C.isData3DTexture?H.texSubImage3D(Et,Tt,Pt,pe,Ve,Ct,At,Rt,be,en,Ee.data):G.isCompressedArrayTexture?H.compressedTexSubImage3D(Et,Tt,Pt,pe,Ve,Ct,At,Rt,be,Ee.data):H.texSubImage3D(Et,Tt,Pt,pe,Ve,Ct,At,Rt,be,en,Ee):C.isDataTexture?H.texSubImage2D(H.TEXTURE_2D,Tt,Pt,pe,Ct,At,be,en,Ee.data):C.isCompressedTexture?H.compressedTexSubImage2D(H.TEXTURE_2D,Tt,Pt,pe,Ee.width,Ee.height,be,Ee.data):H.texSubImage2D(H.TEXTURE_2D,Tt,Pt,pe,Ct,At,be,en,Ee);w.pixelStorei(H.UNPACK_ROW_LENGTH,ln),w.pixelStorei(H.UNPACK_IMAGE_HEIGHT,re),w.pixelStorei(H.UNPACK_SKIP_PIXELS,Un),w.pixelStorei(H.UNPACK_SKIP_ROWS,ai),w.pixelStorei(H.UNPACK_SKIP_IMAGES,Di),Tt===0&&G.generateMipmaps&&H.generateMipmap(Et),w.unbindTexture()},this.initRenderTarget=function(C){K.get(C).__webglFramebuffer===void 0&&ot.setupRenderTarget(C)},this.initTexture=function(C){C.isCubeTexture?ot.setTextureCube(C,0):C.isData3DTexture?ot.setTexture3D(C,0):C.isDataArrayTexture||C.isCompressedArrayTexture?ot.setTexture2DArray(C,0):ot.setTexture2D(C,0),w.unbindTexture()},this.resetState=function(){V=0,Y=0,it=null,w.reset(),vt.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Zn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;const e=this.getContext();e.drawingBufferColorSpace=Qt._getDrawingBufferColorSpace(t),e.unpackColorSpace=Qt._getUnpackColorSpace()}}const Ef={type:"change"},_c={type:"start"},Cf={type:"end"},Za=new vs,Rf=new Kn,R_=Math.cos(70*sa.DEG2RAD),Xe=new L,un=2*Math.PI,xe={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},Mc=1e-6;class P_ extends h0{constructor(t,e=null){super(t,e),this.state=xe.NONE,this.target=new L,this.cursor=new L,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:cn.ROTATE,MIDDLE:cn.DOLLY,RIGHT:cn.PAN},this.touches={ONE:Nn.ROTATE,TWO:Nn.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._cursorStyle="auto",this._domElementKeyEvents=null,this._lastPosition=new L,this._lastQuaternion=new He,this._lastTargetPosition=new L,this._quat=new He().setFromUnitVectors(t.up,new L(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new qu,this._sphericalDelta=new qu,this._scale=1,this._panOffset=new L,this._rotateStart=new ft,this._rotateEnd=new ft,this._rotateDelta=new ft,this._panStart=new ft,this._panEnd=new ft,this._panDelta=new ft,this._dollyStart=new ft,this._dollyEnd=new ft,this._dollyDelta=new ft,this._dollyDirection=new L,this._mouse=new ft,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=L_.bind(this),this._onPointerDown=I_.bind(this),this._onPointerUp=D_.bind(this),this._onContextMenu=k_.bind(this),this._onMouseWheel=F_.bind(this),this._onKeyDown=z_.bind(this),this._onTouchStart=O_.bind(this),this._onTouchMove=B_.bind(this),this._onMouseDown=U_.bind(this),this._onMouseMove=N_.bind(this),this._interceptControlDown=V_.bind(this),this._interceptControlUp=H_.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}set cursorStyle(t){this._cursorStyle=t,t==="grab"?this.domElement.style.cursor="grab":this.domElement.style.cursor="auto"}get cursorStyle(){return this._cursorStyle}connect(t){super.connect(t),this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.state=xe.NONE,this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.ownerDocument.removeEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents();const t=this.domElement.getRootNode();t.removeEventListener("keydown",this._interceptControlDown,{capture:!0}),t.removeEventListener("keyup",this._interceptControlUp,{capture:!0}),this._controlActive=!1,this._pointers.length=0,this._pointerPositions={},this.domElement.style.touchAction="",this.domElement.style.cursor="auto"}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(t){t.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=t}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(Ef),this.update(),this.state=xe.NONE}pan(t,e){this._pan(t,e),this.update()}dollyIn(t){this._dollyIn(t),this.update()}dollyOut(t){this._dollyOut(t),this.update()}rotateLeft(t){this._rotateLeft(t),this.update()}rotateUp(t){this._rotateUp(t),this.update()}update(t=null){const e=this.object.position;Xe.copy(e).sub(this.target),Xe.applyQuaternion(this._quat),this._spherical.setFromVector3(Xe),this.autoRotate&&this.state===xe.NONE&&this._rotateLeft(this._getAutoRotationAngle(t)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,i=this.maxAzimuthAngle;isFinite(n)&&isFinite(i)&&(n<-Math.PI?n+=un:n>Math.PI&&(n-=un),i<-Math.PI?i+=un:i>Math.PI&&(i-=un),n<=i?this._spherical.theta=Math.max(n,Math.min(i,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+i)/2?Math.max(n,this._spherical.theta):Math.min(i,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let s=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{const a=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),s=a!=this._spherical.radius}if(Xe.setFromSpherical(this._spherical),Xe.applyQuaternion(this._quatInverse),e.copy(this.target).add(Xe),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let a=null;if(this.object.isPerspectiveCamera){const o=Xe.length();a=this._clampDistance(o*this._scale);const l=o-a;this.object.position.addScaledVector(this._dollyDirection,l),this.object.updateMatrixWorld(),s=!!l}else if(this.object.isOrthographicCamera){const o=new L(this._mouse.x,this._mouse.y,0);o.unproject(this.object);const l=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),s=l!==this.object.zoom;const c=new L(this._mouse.x,this._mouse.y,0);c.unproject(this.object),this.object.position.sub(c).add(o),this.object.updateMatrixWorld(),a=Xe.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;a!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(a).add(this.object.position):(Za.origin.copy(this.object.position),Za.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(Za.direction))<R_?this.object.lookAt(this.target):(Rf.setFromNormalAndCoplanarPoint(this.object.up,this.target),Za.intersectPlane(Rf,this.target))))}else if(this.object.isOrthographicCamera){const a=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),a!==this.object.zoom&&(this.object.updateProjectionMatrix(),s=!0)}return this._scale=1,this._performCursorZoom=!1,s||this._lastPosition.distanceToSquared(this.object.position)>Mc||8*(1-this._lastQuaternion.dot(this.object.quaternion))>Mc||this._lastTargetPosition.distanceToSquared(this.target)>Mc?(this.dispatchEvent(Ef),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(t){return t!==null?un/60*this.autoRotateSpeed*t:un/60/60*this.autoRotateSpeed}_getZoomScale(t){const e=Math.abs(t*.01);return Math.pow(.95,this.zoomSpeed*e)}_rotateLeft(t){this._sphericalDelta.theta-=t}_rotateUp(t){this._sphericalDelta.phi-=t}_panLeft(t,e){Xe.setFromMatrixColumn(e,0),Xe.multiplyScalar(-t),this._panOffset.add(Xe)}_panUp(t,e){this.screenSpacePanning===!0?Xe.setFromMatrixColumn(e,1):(Xe.setFromMatrixColumn(e,0),Xe.crossVectors(this.object.up,Xe)),Xe.multiplyScalar(t),this._panOffset.add(Xe)}_pan(t,e){const n=this.domElement;if(this.object.isPerspectiveCamera){const i=this.object.position;Xe.copy(i).sub(this.target);let s=Xe.length();s*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*t*s/n.clientHeight,this.object.matrix),this._panUp(2*e*s/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(t*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(e*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(t,e){if(!this.zoomToCursor)return;this._performCursorZoom=!0;const n=this.domElement.getBoundingClientRect(),i=t-n.left,s=e-n.top,a=n.width,o=n.height;this._mouse.x=i/a*2-1,this._mouse.y=-(s/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(t){return Math.max(this.minDistance,Math.min(this.maxDistance,t))}_handleMouseDownRotate(t){this._rotateStart.set(t.clientX,t.clientY)}_handleMouseDownDolly(t){this._updateZoomParameters(t.clientX,t.clientX),this._dollyStart.set(t.clientX,t.clientY)}_handleMouseDownPan(t){this._panStart.set(t.clientX,t.clientY)}_handleMouseMoveRotate(t){this._rotateEnd.set(t.clientX,t.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const e=this.domElement;this._rotateLeft(un*this._rotateDelta.x/e.clientHeight),this._rotateUp(un*this._rotateDelta.y/e.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(t){this._dollyEnd.set(t.clientX,t.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(t){this._panEnd.set(t.clientX,t.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(t){this._updateZoomParameters(t.clientX,t.clientY),t.deltaY<0?this._dollyIn(this._getZoomScale(t.deltaY)):t.deltaY>0&&this._dollyOut(this._getZoomScale(t.deltaY)),this.update()}_handleKeyDown(t){let e=!1;switch(t.code){case this.keys.UP:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateUp(un*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),e=!0;break;case this.keys.BOTTOM:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateUp(-un*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),e=!0;break;case this.keys.LEFT:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateLeft(un*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),e=!0;break;case this.keys.RIGHT:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateLeft(-un*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),e=!0;break}e&&(t.preventDefault(),this.update())}_handleTouchStartRotate(t){if(this._pointers.length===1)this._rotateStart.set(t.pageX,t.pageY);else{const e=this._getSecondPointerPosition(t),n=.5*(t.pageX+e.x),i=.5*(t.pageY+e.y);this._rotateStart.set(n,i)}}_handleTouchStartPan(t){if(this._pointers.length===1)this._panStart.set(t.pageX,t.pageY);else{const e=this._getSecondPointerPosition(t),n=.5*(t.pageX+e.x),i=.5*(t.pageY+e.y);this._panStart.set(n,i)}}_handleTouchStartDolly(t){const e=this._getSecondPointerPosition(t),n=t.pageX-e.x,i=t.pageY-e.y,s=Math.sqrt(n*n+i*i);this._dollyStart.set(0,s)}_handleTouchStartDollyPan(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enablePan&&this._handleTouchStartPan(t)}_handleTouchStartDollyRotate(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enableRotate&&this._handleTouchStartRotate(t)}_handleTouchMoveRotate(t){if(this._pointers.length==1)this._rotateEnd.set(t.pageX,t.pageY);else{const n=this._getSecondPointerPosition(t),i=.5*(t.pageX+n.x),s=.5*(t.pageY+n.y);this._rotateEnd.set(i,s)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const e=this.domElement;this._rotateLeft(un*this._rotateDelta.x/e.clientHeight),this._rotateUp(un*this._rotateDelta.y/e.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(t){if(this._pointers.length===1)this._panEnd.set(t.pageX,t.pageY);else{const e=this._getSecondPointerPosition(t),n=.5*(t.pageX+e.x),i=.5*(t.pageY+e.y);this._panEnd.set(n,i)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(t){const e=this._getSecondPointerPosition(t),n=t.pageX-e.x,i=t.pageY-e.y,s=Math.sqrt(n*n+i*i);this._dollyEnd.set(0,s),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);const a=(t.pageX+e.x)*.5,o=(t.pageY+e.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enablePan&&this._handleTouchMovePan(t)}_handleTouchMoveDollyRotate(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enableRotate&&this._handleTouchMoveRotate(t)}_addPointer(t){this._pointers.push(t.pointerId)}_removePointer(t){delete this._pointerPositions[t.pointerId];for(let e=0;e<this._pointers.length;e++)if(this._pointers[e]==t.pointerId){this._pointers.splice(e,1);return}}_isTrackingPointer(t){for(let e=0;e<this._pointers.length;e++)if(this._pointers[e]==t.pointerId)return!0;return!1}_trackPointer(t){let e=this._pointerPositions[t.pointerId];e===void 0&&(e=new ft,this._pointerPositions[t.pointerId]=e),e.set(t.pageX,t.pageY)}_getSecondPointerPosition(t){const e=t.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[e]}_customWheelEvent(t){const e=t.deltaMode,n={clientX:t.clientX,clientY:t.clientY,deltaY:t.deltaY};switch(e){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100;break}return t.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}}function I_(r){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(r.pointerId),this.domElement.ownerDocument.addEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(r)&&(this._addPointer(r),r.pointerType==="touch"?this._onTouchStart(r):this._onMouseDown(r),this._cursorStyle==="grab"&&(this.domElement.style.cursor="grabbing")))}function L_(r){this.enabled!==!1&&(r.pointerType==="touch"?this._onTouchMove(r):this._onMouseMove(r))}function D_(r){switch(this._removePointer(r),this._pointers.length){case 0:this.domElement.releasePointerCapture(r.pointerId),this.domElement.ownerDocument.removeEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(Cf),this.state=xe.NONE,this._cursorStyle==="grab"&&(this.domElement.style.cursor="grab");break;case 1:const t=this._pointers[0],e=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:e.x,pageY:e.y});break}}function U_(r){let t;switch(r.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case cn.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(r),this.state=xe.DOLLY;break;case cn.ROTATE:if(r.ctrlKey||r.metaKey||r.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(r),this.state=xe.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(r),this.state=xe.ROTATE}break;case cn.PAN:if(r.ctrlKey||r.metaKey||r.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(r),this.state=xe.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(r),this.state=xe.PAN}break;default:this.state=xe.NONE}this.state!==xe.NONE&&this.dispatchEvent(_c)}function N_(r){switch(this.state){case xe.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(r);break;case xe.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(r);break;case xe.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(r);break}}function F_(r){this.enabled===!1||this.enableZoom===!1||this.state!==xe.NONE||(r.preventDefault(),this.dispatchEvent(_c),this._handleMouseWheel(this._customWheelEvent(r)),this.dispatchEvent(Cf))}function z_(r){this.enabled!==!1&&this._handleKeyDown(r)}function O_(r){switch(this._trackPointer(r),this._pointers.length){case 1:switch(this.touches.ONE){case Nn.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(r),this.state=xe.TOUCH_ROTATE;break;case Nn.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(r),this.state=xe.TOUCH_PAN;break;default:this.state=xe.NONE}break;case 2:switch(this.touches.TWO){case Nn.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(r),this.state=xe.TOUCH_DOLLY_PAN;break;case Nn.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(r),this.state=xe.TOUCH_DOLLY_ROTATE;break;default:this.state=xe.NONE}break;default:this.state=xe.NONE}this.state!==xe.NONE&&this.dispatchEvent(_c)}function B_(r){switch(this._trackPointer(r),this.state){case xe.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(r),this.update();break;case xe.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(r),this.update();break;case xe.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(r),this.update();break;case xe.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(r),this.update();break;default:this.state=xe.NONE}}function k_(r){this.enabled!==!1&&r.preventDefault()}function V_(r){r.key==="Control"&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function H_(r){r.key==="Control"&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}const Xi={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`};class Yi{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}}const G_=new Dr(-1,1,1,-1,0,1);class W_ extends ve{constructor(){super(),this.setAttribute("position",new Zt([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new Zt([0,2,0,0,2,0],2))}}const X_=new W_;class $a{constructor(t){this._mesh=new Xt(X_,t)}dispose(){this._mesh.geometry.dispose()}render(t){t.render(this._mesh,G_)}get material(){return this._mesh.material}set material(t){this._mesh.material=t}}class Y_ extends Yi{constructor(t,e="tDiffuse"){super(),this.textureID=e,this.uniforms=null,this.material=null,t instanceof le?(this.uniforms=t.uniforms,this.material=t):t&&(this.uniforms=Hn.clone(t.uniforms),this.material=new le({name:t.name!==void 0?t.name:"unspecified",defines:Object.assign({},t.defines),uniforms:this.uniforms,vertexShader:t.vertexShader,fragmentShader:t.fragmentShader})),this._fsQuad=new $a(this.material)}render(t,e,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(e),this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),this._fsQuad.render(t))}dispose(){this.material.dispose(),this._fsQuad.dispose()}}class Pf extends Yi{constructor(t,e){super(),this.scene=t,this.camera=e,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(t,e,n){const i=t.getContext(),s=t.state;s.buffers.color.setMask(!1),s.buffers.depth.setMask(!1),s.buffers.color.setLocked(!0),s.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),s.buffers.stencil.setTest(!0),s.buffers.stencil.setOp(i.REPLACE,i.REPLACE,i.REPLACE),s.buffers.stencil.setFunc(i.ALWAYS,a,4294967295),s.buffers.stencil.setClear(o),s.buffers.stencil.setLocked(!0),t.setRenderTarget(n),this.clear&&t.clear(),t.render(this.scene,this.camera),t.setRenderTarget(e),this.clear&&t.clear(),t.render(this.scene,this.camera),s.buffers.color.setLocked(!1),s.buffers.depth.setLocked(!1),s.buffers.color.setMask(!0),s.buffers.depth.setMask(!0),s.buffers.stencil.setLocked(!1),s.buffers.stencil.setFunc(i.EQUAL,1,4294967295),s.buffers.stencil.setOp(i.KEEP,i.KEEP,i.KEEP),s.buffers.stencil.setLocked(!0)}}class q_ extends Yi{constructor(){super(),this.needsSwap=!1}render(t){t.state.buffers.stencil.setLocked(!1),t.state.buffers.stencil.setTest(!1)}}class Z_{constructor(t,e){if(this.renderer=t,this._pixelRatio=t.getPixelRatio(),e===void 0){const n=t.getSize(new ft);this._width=n.width,this._height=n.height,e=new $e(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:Je}),e.texture.name="EffectComposer.rt1"}else this._width=e.width,this._height=e.height;this.renderTarget1=e,this.renderTarget2=e.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Y_(Xi),this.copyPass.material.blending=Ze,this.timer=new jm}swapBuffers(){const t=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=t}addPass(t){this.passes.push(t),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(t,e){this.passes.splice(e,0,t),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(t){const e=this.passes.indexOf(t);e!==-1&&this.passes.splice(e,1)}isLastEnabledPass(t){for(let e=t+1;e<this.passes.length;e++)if(this.passes[e].enabled)return!1;return!0}render(t){this.timer.update(),t===void 0&&(t=this.timer.getDelta());const e=this.renderer.getRenderTarget();let n=!1;for(let i=0,s=this.passes.length;i<s;i++){const a=this.passes[i];if(a.enabled!==!1){if(a.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(i),a.render(this.renderer,this.writeBuffer,this.readBuffer,t,n),a.needsSwap){if(n){const o=this.renderer.getContext(),l=this.renderer.state.buffers.stencil;l.setFunc(o.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,t),l.setFunc(o.EQUAL,1,4294967295)}this.swapBuffers()}Pf!==void 0&&(a instanceof Pf?n=!0:a instanceof q_&&(n=!1))}}this.renderer.setRenderTarget(e)}reset(t){if(t===void 0){const e=this.renderer.getSize(new ft);this._pixelRatio=this.renderer.getPixelRatio(),this._width=e.width,this._height=e.height,t=this.renderTarget1.clone(),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=t,this.renderTarget2=t.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(t,e){this._width=t,this._height=e;const n=this._width*this._pixelRatio,i=this._height*this._pixelRatio;this.renderTarget1.setSize(n,i),this.renderTarget2.setSize(n,i);for(let s=0;s<this.passes.length;s++)this.passes[s].setSize(n,i)}setPixelRatio(t){this._pixelRatio=t,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}}class $_ extends Yi{constructor(t,e,n=null,i=null,s=null){super(),this.scene=t,this.camera=e,this.overrideMaterial=n,this.clearColor=i,this.clearAlpha=s,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new pt}render(t,e,n){const i=t.autoClear;t.autoClear=!1;let s,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(t.getClearColor(this._oldClearColor),t.setClearColor(this.clearColor,t.getClearAlpha())),this.clearAlpha!==null&&(s=t.getClearAlpha(),t.setClearAlpha(this.clearAlpha)),this.clearDepth==!0&&t.clearDepth(),t.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),t.render(this.scene,this.camera),this.clearColor!==null&&t.setClearColor(this._oldClearColor),this.clearAlpha!==null&&t.setClearAlpha(s),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),t.autoClear=i}}const K_={uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new pt(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`};class Us extends Yi{constructor(t,e=1,n,i){super(),this.strength=e,this.radius=n,this.threshold=i,this.resolution=t!==void 0?new ft(t.x,t.y):new ft(256,256),this.clearColor=new pt(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let s=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new $e(s,a,{type:Je,depthBuffer:!1}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let h=0;h<this.nMips;h++){const d=new $e(s,a,{type:Je,depthBuffer:!1});d.texture.name="UnrealBloomPass.h"+h,d.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(d);const u=new $e(s,a,{type:Je,depthBuffer:!1});u.texture.name="UnrealBloomPass.v"+h,u.texture.generateMipmaps=!1,this.renderTargetsVertical.push(u),s=Math.round(s/2),a=Math.round(a/2)}const o=K_;this.highPassUniforms=Hn.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=i,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new le({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];const l=[6,10,14,18,22];s=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let h=0;h<this.nMips;h++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(l[h])),this.separableBlurMaterials[h].uniforms.invSize.value=new ft(1/s,1/a),s=Math.round(s/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=e,this.compositeMaterial.uniforms.bloomRadius.value=.1;const c=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=c,this.bloomTintColors=[new L(1,1,1),new L(1,1,1),new L(1,1,1),new L(1,1,1),new L(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=Hn.clone(Xi.uniforms),this.blendMaterial=new le({uniforms:this.copyUniforms,vertexShader:Xi.vertexShader,fragmentShader:Xi.fragmentShader,premultipliedAlpha:!0,blending:Fn,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new pt,this._oldClearAlpha=1,this._basic=new Te,this._fsQuad=new $a(null)}dispose(){for(let t=0;t<this.renderTargetsHorizontal.length;t++)this.renderTargetsHorizontal[t].dispose();for(let t=0;t<this.renderTargetsVertical.length;t++)this.renderTargetsVertical[t].dispose();this.renderTargetBright.dispose();for(let t=0;t<this.separableBlurMaterials.length;t++)this.separableBlurMaterials[t].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(t,e){let n=Math.round(t/2),i=Math.round(e/2);this.renderTargetBright.setSize(n,i);for(let s=0;s<this.nMips;s++)this.renderTargetsHorizontal[s].setSize(n,i),this.renderTargetsVertical[s].setSize(n,i),this.separableBlurMaterials[s].uniforms.invSize.value=new ft(1/n,1/i),n=Math.round(n/2),i=Math.round(i/2)}render(t,e,n,i,s){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();const a=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),s&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=n.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=n.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let o=this.renderTargetBright;for(let l=0;l<this.nMips;l++)this._fsQuad.material=this.separableBlurMaterials[l],this.separableBlurMaterials[l].uniforms.colorTexture.value=o.texture,this.separableBlurMaterials[l].uniforms.direction.value=Us.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[l]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[l].uniforms.colorTexture.value=this.renderTargetsHorizontal[l].texture,this.separableBlurMaterials[l].uniforms.direction.value=Us.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[l]),t.clear(),this._fsQuad.render(t),o=this.renderTargetsVertical[l];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,s&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(n),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=a}_getSeparableBlurMaterial(t){const e=[],n=t/3;for(let a=0;a<t;a++)e.push(.39894*Math.exp(-.5*a*a/(n*n))/n);const i=[],s=[];for(let a=1;a<t;a+=2){const o=e[a],l=a+1<t?e[a+1]:0,c=o+l;i.push((a*o+(a+1)*l)/c),s.push(c)}return new le({defines:{KERNEL_PAIRS:i.length},uniforms:{colorTexture:{value:null},invSize:{value:new ft(.5,.5)},direction:{value:new ft(.5,.5)},centerWeight:{value:e[0]},gaussianOffsets:{value:i},gaussianWeights:{value:s}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float centerWeight;
				uniform float gaussianOffsets[KERNEL_PAIRS];
				uniform float gaussianWeights[KERNEL_PAIRS];

				void main() {

					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * centerWeight;

					for ( int i = 0; i < KERNEL_PAIRS; i ++ ) {

						vec2 uvOffset = direction * invSize * gaussianOffsets[ i ];
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * gaussianWeights[ i ];

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`})}_getCompositeMaterial(t){return new le({defines:{NUM_MIPS:t},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`})}}Us.BlurDirectionX=new ft(1,0),Us.BlurDirectionY=new ft(0,1);const Ka={name:"OutputShader",uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`};class J_ extends Yi{constructor(){super(),this.isOutputPass=!0,this.uniforms=Hn.clone(Ka.uniforms),this.material=new Iu({name:Ka.name,uniforms:this.uniforms,vertexShader:Ka.vertexShader,fragmentShader:Ka.fragmentShader}),this._fsQuad=new $a(this.material),this._outputColorSpace=null,this._toneMapping=null}render(t,e,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=t.toneMappingExposure,(this._outputColorSpace!==t.outputColorSpace||this._toneMapping!==t.toneMapping)&&(this._outputColorSpace=t.outputColorSpace,this._toneMapping=t.toneMapping,this.material.defines={},Qt.getTransfer(this._outputColorSpace)===he&&(this.material.defines.SRGB_TRANSFER=""),this._toneMapping===Mo?this.material.defines.LINEAR_TONE_MAPPING="":this._toneMapping===yo?this.material.defines.REINHARD_TONE_MAPPING="":this._toneMapping===So?this.material.defines.CINEON_TONE_MAPPING="":this._toneMapping===Wr?this.material.defines.ACES_FILMIC_TONE_MAPPING="":this._toneMapping===wo?this.material.defines.AGX_TONE_MAPPING="":this._toneMapping===Ao?this.material.defines.NEUTRAL_TONE_MAPPING="":this._toneMapping===bo&&(this.material.defines.CUSTOM_TONE_MAPPING=""),this.material.needsUpdate=!0),this.renderToScreen===!0?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(e),this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),this._fsQuad.render(t))}dispose(){this.material.dispose(),this._fsQuad.dispose()}}const Ja={defines:{PERSPECTIVE_CAMERA:1,SAMPLES:16,NORMAL_VECTOR_TYPE:1,DEPTH_SWIZZLING:"x",SCREEN_SPACE_RADIUS:0,SCREEN_SPACE_RADIUS_SCALE:100,SCENE_CLIP_BOX:0},uniforms:{tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new ft},cameraNear:{value:null},cameraFar:{value:null},cameraProjectionMatrix:{value:new It},cameraProjectionMatrixInverse:{value:new It},cameraWorldMatrix:{value:new It},radius:{value:.25},distanceExponent:{value:1},thickness:{value:1},distanceFallOff:{value:1},scale:{value:1},sceneBoxMin:{value:new L(-1,-1,-1)},sceneBoxMax:{value:new L(1,1,1)}},vertexShader:`

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		varying vec2 vUv;
		uniform highp sampler2D tNormal;
		uniform highp sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec2 resolution;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraProjectionMatrixInverse;
		uniform mat4 cameraWorldMatrix;
		uniform float radius;
		uniform float distanceExponent;
		uniform float thickness;
		uniform float distanceFallOff;
		uniform float scale;
		#if SCENE_CLIP_BOX == 1
			uniform vec3 sceneBoxMin;
			uniform vec3 sceneBoxMax;
		#endif

		#include <common>
		#include <packing>

		#ifndef FRAGMENT_OUTPUT
		#define FRAGMENT_OUTPUT vec4(vec3(ao), 1.)
		#endif

		vec3 getViewPosition( const in vec2 screenPosition, const in float depth ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				vec4 clipSpacePosition = vec4( vec2( screenPosition ) * 2.0 - 1.0, depth, 1.0 );
			#else
				vec4 clipSpacePosition = vec4( vec3( screenPosition, depth ) * 2.0 - 1.0, 1.0 );
			#endif
			vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
			return viewSpacePosition.xyz / viewSpacePosition.w;
		}

		float getDepth(const vec2 uv) {
			return textureLod(tDepth, uv.xy, 0.0).DEPTH_SWIZZLING;
		}

		float fetchDepth(const ivec2 uv) {
			return texelFetch(tDepth, uv.xy, 0).DEPTH_SWIZZLING;
		}

		float getViewZ(const in float depth) {
			#if PERSPECTIVE_CAMERA == 1
				return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
			#else
				return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
			#endif
		}

		vec3 computeNormalFromDepth(const vec2 uv) {
			vec2 size = vec2(textureSize(tDepth, 0));
			ivec2 p = ivec2(uv * size);
			float c0 = fetchDepth(p);
			float l2 = fetchDepth(p - ivec2(2, 0));
			float l1 = fetchDepth(p - ivec2(1, 0));
			float r1 = fetchDepth(p + ivec2(1, 0));
			float r2 = fetchDepth(p + ivec2(2, 0));
			float b2 = fetchDepth(p - ivec2(0, 2));
			float b1 = fetchDepth(p - ivec2(0, 1));
			float t1 = fetchDepth(p + ivec2(0, 1));
			float t2 = fetchDepth(p + ivec2(0, 2));
			float dl = abs((2.0 * l1 - l2) - c0);
			float dr = abs((2.0 * r1 - r2) - c0);
			float db = abs((2.0 * b1 - b2) - c0);
			float dt = abs((2.0 * t1 - t2) - c0);
			vec3 ce = getViewPosition(uv, c0).xyz;
			vec3 dpdx = (dl < dr) ? ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz : -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;
			vec3 dpdy = (db < dt) ? ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz : -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;
			return normalize(cross(dpdx, dpdy));
		}

		vec3 getViewNormal(const vec2 uv) {
			#if NORMAL_VECTOR_TYPE == 2
				return normalize(textureLod(tNormal, uv, 0.).rgb);
			#elif NORMAL_VECTOR_TYPE == 1
				return unpackRGBToNormal(textureLod(tNormal, uv, 0.).rgb);
			#else
				return computeNormalFromDepth(uv);
			#endif
		}

		vec3 getSceneUvAndDepth(vec3 sampleViewPos) {
			vec4 sampleClipPos = cameraProjectionMatrix * vec4(sampleViewPos, 1.);
			vec2 sampleUv = sampleClipPos.xy / sampleClipPos.w * 0.5 + 0.5;
			float sampleSceneDepth = getDepth(sampleUv);
			return vec3(sampleUv, sampleSceneDepth);
		}

		void main() {
			float depth = getDepth(vUv.xy);

			#ifdef USE_REVERSED_DEPTH_BUFFER
				if (depth <= 0.0) {
					discard;
					return;
				}
			#else
				if (depth >= 1.0) {
					discard;
					return;
				}
			#endif
			
			vec3 viewPos = getViewPosition(vUv, depth);
			vec3 viewNormal = getViewNormal(vUv);

			float radiusToUse = radius;
			float distanceFalloffToUse = thickness;
			#if SCREEN_SPACE_RADIUS == 1
				float radiusScale = getViewPosition(vec2(0.5 + float(SCREEN_SPACE_RADIUS_SCALE) / resolution.x, 0.0), depth).x;
				radiusToUse *= radiusScale;
				distanceFalloffToUse *= radiusScale;
			#endif

			#if SCENE_CLIP_BOX == 1
				vec3 worldPos = (cameraWorldMatrix * vec4(viewPos, 1.0)).xyz;
				float boxDistance = length(max(vec3(0.0), max(sceneBoxMin - worldPos, worldPos - sceneBoxMax)));
				if (boxDistance > radiusToUse) {
					discard;
					return;
				}
			#endif

			vec2 noiseResolution = vec2(textureSize(tNoise, 0));
			vec2 noiseUv = vUv * resolution / noiseResolution;
			vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);
			vec3 randomVec = noiseTexel.xyz * 2.0 - 1.0;
			vec3 tangent = normalize(vec3(randomVec.xy, 0.));
			vec3 bitangent = vec3(-tangent.y, tangent.x, 0.);
			mat3 kernelMatrix = mat3(tangent, bitangent, vec3(0., 0., 1.));

			const int DIRECTIONS = SAMPLES < 30 ? 3 : 5;
			const int STEPS = (SAMPLES + DIRECTIONS - 1) / DIRECTIONS;
			float ao = 0.0;
			for (int i = 0; i < DIRECTIONS; ++i) {

				float angle = float(i) / float(DIRECTIONS) * PI;
				vec4 sampleDir = vec4(cos(angle), sin(angle), 0., 0.5 + 0.5 * noiseTexel.w);
				sampleDir.xyz = normalize(kernelMatrix * sampleDir.xyz);

				vec3 viewDir = normalize(-viewPos.xyz);
				vec3 sliceBitangent = normalize(cross(sampleDir.xyz, viewDir));
				vec3 sliceTangent = cross(sliceBitangent, viewDir);
				vec3 normalInSlice = normalize(viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent));

				vec3 tangentToNormalInSlice = cross(normalInSlice, sliceBitangent);
				vec2 cosHorizons = vec2(dot(viewDir, tangentToNormalInSlice), dot(viewDir, -tangentToNormalInSlice));

				for (int j = 0; j < STEPS; ++j) {
					vec3 sampleViewOffset = sampleDir.xyz * radiusToUse * sampleDir.w * pow(float(j + 1) / float(STEPS), distanceExponent);

					vec3 sampleSceneUvDepth = getSceneUvAndDepth(viewPos + sampleViewOffset);
					vec3 sampleSceneViewPos = getViewPosition(sampleSceneUvDepth.xy, sampleSceneUvDepth.z);
					vec3 viewDelta = sampleSceneViewPos - viewPos;
					if (abs(viewDelta.z) < thickness) {
						float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
						cosHorizons.x += max(0., (sampleCosHorizon - cosHorizons.x) * mix(1., 2. / float(j + 2), distanceFallOff));
					}

					sampleSceneUvDepth = getSceneUvAndDepth(viewPos - sampleViewOffset);
					sampleSceneViewPos = getViewPosition(sampleSceneUvDepth.xy, sampleSceneUvDepth.z);
					viewDelta = sampleSceneViewPos - viewPos;
					if (abs(viewDelta.z) < thickness) {
						float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
						cosHorizons.y += max(0., (sampleCosHorizon - cosHorizons.y) * mix(1., 2. / float(j + 2), distanceFallOff));
					}
				}

				vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);
				float nx = dot(normalInSlice, sliceTangent);
				float ny = dot(normalInSlice, viewDir);
				float nxb = 1. / 2. * (acos(cosHorizons.y) - acos(cosHorizons.x) + sinHorizons.x * cosHorizons.x - sinHorizons.y * cosHorizons.y);
				float nyb = 1. / 2. * (2. - cosHorizons.x * cosHorizons.x - cosHorizons.y * cosHorizons.y);
				float occlusion = nx * nxb + ny * nyb;
				ao += occlusion;
			}

			ao = clamp(ao / float(DIRECTIONS), 0., 1.);
		#if SCENE_CLIP_BOX == 1
			ao = mix(ao, 1., smoothstep(0., radiusToUse, boxDistance));
		#endif
			ao = pow(ao, scale);

			gl_FragColor = FRAGMENT_OUTPUT;
		}`},ja={defines:{PERSPECTIVE_CAMERA:1},uniforms:{tDepth:{value:null},cameraNear:{value:null},cameraFar:{value:null}},vertexShader:`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		uniform sampler2D tDepth;
		uniform float cameraNear;
		uniform float cameraFar;
		varying vec2 vUv;

		#include <packing>

		float getLinearDepth( const in vec2 screenPosition ) {
			#if PERSPECTIVE_CAMERA == 1
				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
			#else
				return texture2D( tDepth, screenPosition ).x;
			#endif
		}

		void main() {
			float depth = getLinearDepth( vUv );
			gl_FragColor = vec4( vec3( 1.0 - depth ), 1.0 );

		}`},yc={uniforms:{tDiffuse:{value:null},intensity:{value:1}},vertexShader:`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		uniform float intensity;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;

		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = vec4(mix(vec3(1.), texel.rgb, intensity), texel.a);
		}`};function j_(r=5){const t=Math.floor(r)%2===0?Math.floor(r)+1:Math.floor(r),e=Q_(t),n=e.length,i=new Uint8Array(n*4);for(let a=0;a<n;++a){const o=e[a],l=2*Math.PI*o/n,c=new L(Math.cos(l),Math.sin(l),0).normalize();i[a*4]=(c.x*.5+.5)*255,i[a*4+1]=(c.y*.5+.5)*255,i[a*4+2]=127,i[a*4+3]=255}const s=new _s(i,t,t);return s.wrapS=hn,s.wrapT=hn,s.needsUpdate=!0,s}function Q_(r){const t=Math.floor(r)%2===0?Math.floor(r)+1:Math.floor(r),e=t*t,n=Array(e).fill(0);let i=Math.floor(t/2),s=t-1;for(let a=1;a<=e;){if(i===-1&&s===t?(s=t-2,i=0):(s===t&&(s=0),i<0&&(i=t-1)),n[i*t+s]!==0){s-=2,i++;continue}else n[i*t+s]=a++;s++,i--}return n}const Qa={defines:{SAMPLES:16,SAMPLE_VECTORS:If(16,2,1),NORMAL_VECTOR_TYPE:1,DEPTH_VALUE_SOURCE:0},uniforms:{tDiffuse:{value:null},tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new ft},cameraProjectionMatrixInverse:{value:new It},lumaPhi:{value:5},depthPhi:{value:5},normalPhi:{value:5},radius:{value:4},index:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`

		varying vec2 vUv;

		uniform sampler2D tDiffuse;
		uniform sampler2D tNormal;
		uniform sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec2 resolution;
		uniform mat4 cameraProjectionMatrixInverse;
		uniform float lumaPhi;
		uniform float depthPhi;
		uniform float normalPhi;
		uniform float radius;
		uniform int index;

		#include <common>
		#include <packing>

		#ifndef SAMPLE_LUMINANCE
		#define SAMPLE_LUMINANCE dot(vec3(0.2125, 0.7154, 0.0721), a)
		#endif

		#ifndef FRAGMENT_OUTPUT
		#define FRAGMENT_OUTPUT vec4(denoised, 1.)
		#endif

		float getLuminance(const in vec3 a) {
			return SAMPLE_LUMINANCE;
		}

		const vec3 poissonDisk[SAMPLES] = SAMPLE_VECTORS;

		vec3 getViewPosition( const in vec2 screenPosition, const in float depth ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				vec4 clipSpacePosition = vec4( vec2( screenPosition ) * 2.0 - 1.0, depth, 1.0 );
			#else
				vec4 clipSpacePosition = vec4( vec3( screenPosition, depth ) * 2.0 - 1.0, 1.0 );
			#endif
			vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
			return viewSpacePosition.xyz / viewSpacePosition.w;
		}

		float getDepth(const vec2 uv) {
		#if DEPTH_VALUE_SOURCE == 1
			return textureLod(tDepth, uv.xy, 0.0).a;
		#else
			return textureLod(tDepth, uv.xy, 0.0).r;
		#endif
		}

		float fetchDepth(const ivec2 uv) {
			#if DEPTH_VALUE_SOURCE == 1
				return texelFetch(tDepth, uv.xy, 0).a;
			#else
				return texelFetch(tDepth, uv.xy, 0).r;
			#endif
		}

		vec3 computeNormalFromDepth(const vec2 uv) {
			vec2 size = vec2(textureSize(tDepth, 0));
			ivec2 p = ivec2(uv * size);
			float c0 = fetchDepth(p);
			float l2 = fetchDepth(p - ivec2(2, 0));
			float l1 = fetchDepth(p - ivec2(1, 0));
			float r1 = fetchDepth(p + ivec2(1, 0));
			float r2 = fetchDepth(p + ivec2(2, 0));
			float b2 = fetchDepth(p - ivec2(0, 2));
			float b1 = fetchDepth(p - ivec2(0, 1));
			float t1 = fetchDepth(p + ivec2(0, 1));
			float t2 = fetchDepth(p + ivec2(0, 2));
			float dl = abs((2.0 * l1 - l2) - c0);
			float dr = abs((2.0 * r1 - r2) - c0);
			float db = abs((2.0 * b1 - b2) - c0);
			float dt = abs((2.0 * t1 - t2) - c0);
			vec3 ce = getViewPosition(uv, c0).xyz;
			vec3 dpdx = (dl < dr) ?  ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz
									: -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;
			vec3 dpdy = (db < dt) ?  ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz
									: -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;
			return normalize(cross(dpdx, dpdy));
		}

		vec3 getViewNormal(const vec2 uv) {
		#if NORMAL_VECTOR_TYPE == 2
			return normalize(textureLod(tNormal, uv, 0.).rgb);
		#elif NORMAL_VECTOR_TYPE == 1
			return unpackRGBToNormal(textureLod(tNormal, uv, 0.).rgb);
		#else
			return computeNormalFromDepth(uv);
		#endif
		}

		void denoiseSample(in vec3 center, in vec3 viewNormal, in vec3 viewPos, in vec2 sampleUv, inout vec3 denoised, inout float totalWeight) {
			vec4 sampleTexel = textureLod(tDiffuse, sampleUv, 0.0);
			float sampleDepth = getDepth(sampleUv);
			vec3 sampleNormal = getViewNormal(sampleUv);
			vec3 neighborColor = sampleTexel.rgb;
			vec3 viewPosSample = getViewPosition(sampleUv, sampleDepth);

			float normalDiff = dot(viewNormal, sampleNormal);
			float normalSimilarity = pow(max(normalDiff, 0.), normalPhi);
			float lumaDiff = abs(getLuminance(neighborColor) - getLuminance(center));
			float lumaSimilarity = max(1.0 - lumaDiff / lumaPhi, 0.0);
			float depthDiff = abs(dot(viewPos - viewPosSample, viewNormal));
			float depthSimilarity = max(1. - depthDiff / depthPhi, 0.);
			float w = lumaSimilarity * depthSimilarity * normalSimilarity;

			denoised += w * neighborColor;
			totalWeight += w;
		}

		void main() {
			float depth = getDepth(vUv.xy);
			vec3 viewNormal = getViewNormal(vUv);
			if (depth == 1. || dot(viewNormal, viewNormal) == 0.) {
				discard;
				return;
			}
			vec4 texel = textureLod(tDiffuse, vUv, 0.0);
			vec3 center = texel.rgb;
			vec3 viewPos = getViewPosition(vUv, depth);

			vec2 noiseResolution = vec2(textureSize(tNoise, 0));
			vec2 noiseUv = vUv * resolution / noiseResolution;
			vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);
      		vec2 noiseVec = vec2(sin(noiseTexel[index % 4] * 2. * PI), cos(noiseTexel[index % 4] * 2. * PI));
    		mat2 rotationMatrix = mat2(noiseVec.x, -noiseVec.y, noiseVec.x, noiseVec.y);

			float totalWeight = 1.0;
			vec3 denoised = texel.rgb;
			for (int i = 0; i < SAMPLES; i++) {
				vec3 sampleDir = poissonDisk[i];
				vec2 offset = rotationMatrix * (sampleDir.xy * (1. + sampleDir.z * (radius - 1.)) / resolution);
				vec2 sampleUv = vUv + offset;
				denoiseSample(center, viewNormal, viewPos, sampleUv, denoised, totalWeight);
			}

			if (totalWeight > 0.) {
				denoised /= totalWeight;
			}
			gl_FragColor = FRAGMENT_OUTPUT;
		}`};function If(r,t,e){const n=tM(r,t,e);let i="vec3[SAMPLES](";for(let s=0;s<r;s++){const a=n[s];i+=`vec3(${a.x}, ${a.y}, ${a.z})${s<r-1?",":")"}`}return i}function tM(r,t,e){const n=[];for(let i=0;i<r;i++){const s=2*Math.PI*t*i/r,a=Math.pow(i/(r-1),e);n.push(new L(Math.cos(s),Math.sin(s),a))}return n}class eM{constructor(t=Math){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],this.grad4=[[0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],[0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],[1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],[-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],[1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],[-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],[1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],[-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]],this.p=[];for(let e=0;e<256;e++)this.p[e]=Math.floor(t.random()*256);this.perm=[];for(let e=0;e<512;e++)this.perm[e]=this.p[e&255];this.simplex=[[0,1,2,3],[0,1,3,2],[0,0,0,0],[0,2,3,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,3,0],[0,2,1,3],[0,0,0,0],[0,3,1,2],[0,3,2,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,3,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,0,3],[0,0,0,0],[1,3,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,3,0,1],[2,3,1,0],[1,0,2,3],[1,0,3,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,3,1],[0,0,0,0],[2,1,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,1,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,1,2],[3,0,2,1],[0,0,0,0],[3,1,2,0],[2,1,0,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,1,0,2],[0,0,0,0],[3,2,0,1],[3,2,1,0]]}noise(t,e){let n,i,s;const a=.5*(Math.sqrt(3)-1),o=(t+e)*a,l=Math.floor(t+o),c=Math.floor(e+o),h=(3-Math.sqrt(3))/6,d=(l+c)*h,u=l-d,f=c-d,m=t-u,_=e-f;let p,g;m>_?(p=1,g=0):(p=0,g=1);const v=m-p+h,M=_-g+h,x=m-1+2*h,b=_-1+2*h,S=l&255,T=c&255,y=this.perm[S+this.perm[T]]%12,A=this.perm[S+p+this.perm[T+g]]%12,E=this.perm[S+1+this.perm[T+1]]%12;let P=.5-m*m-_*_;P<0?n=0:(P*=P,n=P*P*this._dot(this.grad3[y],m,_));let D=.5-v*v-M*M;D<0?i=0:(D*=D,i=D*D*this._dot(this.grad3[A],v,M));let N=.5-x*x-b*b;return N<0?s=0:(N*=N,s=N*N*this._dot(this.grad3[E],x,b)),70*(n+i+s)}noise3d(t,e,n){let i,s,a,o;const c=(t+e+n)*.3333333333333333,h=Math.floor(t+c),d=Math.floor(e+c),u=Math.floor(n+c),f=1/6,m=(h+d+u)*f,_=h-m,p=d-m,g=u-m,v=t-_,M=e-p,x=n-g;let b,S,T,y,A,E;v>=M?M>=x?(b=1,S=0,T=0,y=1,A=1,E=0):v>=x?(b=1,S=0,T=0,y=1,A=0,E=1):(b=0,S=0,T=1,y=1,A=0,E=1):M<x?(b=0,S=0,T=1,y=0,A=1,E=1):v<x?(b=0,S=1,T=0,y=0,A=1,E=1):(b=0,S=1,T=0,y=1,A=1,E=0);const P=v-b+f,D=M-S+f,N=x-T+f,R=v-y+2*f,B=M-A+2*f,V=x-E+2*f,Y=v-1+3*f,it=M-1+3*f,Z=x-1+3*f,j=h&255,ct=d&255,xt=u&255,_t=this.perm[j+this.perm[ct+this.perm[xt]]]%12,kt=this.perm[j+b+this.perm[ct+S+this.perm[xt+T]]]%12,zt=this.perm[j+y+this.perm[ct+A+this.perm[xt+E]]]%12,Dt=this.perm[j+1+this.perm[ct+1+this.perm[xt+1]]]%12;let st=.6-v*v-M*M-x*x;st<0?i=0:(st*=st,i=st*st*this._dot3(this.grad3[_t],v,M,x));let rt=.6-P*P-D*D-N*N;rt<0?s=0:(rt*=rt,s=rt*rt*this._dot3(this.grad3[kt],P,D,N));let Mt=.6-R*R-B*B-V*V;Mt<0?a=0:(Mt*=Mt,a=Mt*Mt*this._dot3(this.grad3[zt],R,B,V));let Lt=.6-Y*Y-it*it-Z*Z;return Lt<0?o=0:(Lt*=Lt,o=Lt*Lt*this._dot3(this.grad3[Dt],Y,it,Z)),32*(i+s+a+o)}noise4d(t,e,n,i){const s=this.grad4,a=this.simplex,o=this.perm,l=(Math.sqrt(5)-1)/4,c=(5-Math.sqrt(5))/20;let h,d,u,f,m;const _=(t+e+n+i)*l,p=Math.floor(t+_),g=Math.floor(e+_),v=Math.floor(n+_),M=Math.floor(i+_),x=(p+g+v+M)*c,b=p-x,S=g-x,T=v-x,y=M-x,A=t-b,E=e-S,P=n-T,D=i-y,N=A>E?32:0,R=A>P?16:0,B=E>P?8:0,V=A>D?4:0,Y=E>D?2:0,it=P>D?1:0,Z=N+R+B+V+Y+it,j=a[Z][0]>=3?1:0,ct=a[Z][1]>=3?1:0,xt=a[Z][2]>=3?1:0,_t=a[Z][3]>=3?1:0,kt=a[Z][0]>=2?1:0,zt=a[Z][1]>=2?1:0,Dt=a[Z][2]>=2?1:0,st=a[Z][3]>=2?1:0,rt=a[Z][0]>=1?1:0,Mt=a[Z][1]>=1?1:0,Lt=a[Z][2]>=1?1:0,yt=a[Z][3]>=1?1:0,Bt=A-j+c,_e=E-ct+c,Gt=P-xt+c,Vt=D-_t+c,Kt=A-kt+2*c,Ht=E-zt+2*c,ee=P-Dt+2*c,fe=D-st+2*c,Le=A-rt+3*c,jt=E-Mt+3*c,se=P-Lt+3*c,H=D-yt+3*c,Ce=A-1+4*c,Yt=E-1+4*c,U=P-1+4*c,w=D-1+4*c,q=p&255,K=g&255,ot=v&255,k=M&255,$=o[q+o[K+o[ot+o[k]]]]%32,X=o[q+j+o[K+ct+o[ot+xt+o[k+_t]]]]%32,nt=o[q+kt+o[K+zt+o[ot+Dt+o[k+st]]]]%32,mt=o[q+rt+o[K+Mt+o[ot+Lt+o[k+yt]]]]%32,z=o[q+1+o[K+1+o[ot+1+o[k+1]]]]%32;let O=.6-A*A-E*E-P*P-D*D;O<0?h=0:(O*=O,h=O*O*this._dot4(s[$],A,E,P,D));let W=.6-Bt*Bt-_e*_e-Gt*Gt-Vt*Vt;W<0?d=0:(W*=W,d=W*W*this._dot4(s[X],Bt,_e,Gt,Vt));let Q=.6-Kt*Kt-Ht*Ht-ee*ee-fe*fe;Q<0?u=0:(Q*=Q,u=Q*Q*this._dot4(s[nt],Kt,Ht,ee,fe));let dt=.6-Le*Le-jt*jt-se*se-H*H;dt<0?f=0:(dt*=dt,f=dt*dt*this._dot4(s[mt],Le,jt,se,H));let ht=.6-Ce*Ce-Yt*Yt-U*U-w*w;return ht<0?m=0:(ht*=ht,m=ht*ht*this._dot4(s[z],Ce,Yt,U,w)),27*(h+d+u+f+m)}_dot(t,e,n){return t[0]*e+t[1]*n}_dot3(t,e,n,i){return t[0]*e+t[1]*n+t[2]*i}_dot4(t,e,n,i,s){return t[0]*e+t[1]*n+t[2]*i+t[3]*s}}class ni extends Yi{constructor(t,e,n=512,i=512,s,a,o){super(),this.width=n,this.height=i,this.clear=!0,this.camera=e,this.scene=t,this.output=0,this._renderGBuffer=!0,this._visibilityCache=[],this.blendIntensity=1,this.pdRings=2,this.pdRadiusExponent=2,this.pdSamples=16,this.gtaoNoiseTexture=j_(),this.pdNoiseTexture=this._generateNoise(),this.gtaoRenderTarget=new $e(this.width,this.height,{type:Je,depthBuffer:!1}),this.pdRenderTarget=this.gtaoRenderTarget.clone(),this.gtaoMaterial=new le({defines:Object.assign({},Ja.defines),uniforms:Hn.clone(Ja.uniforms),vertexShader:Ja.vertexShader,fragmentShader:Ja.fragmentShader,blending:Ze,depthTest:!1,depthWrite:!1}),this.gtaoMaterial.defines.PERSPECTIVE_CAMERA=this.camera.isPerspectiveCamera?1:0,this.gtaoMaterial.uniforms.tNoise.value=this.gtaoNoiseTexture,this.gtaoMaterial.uniforms.resolution.value.set(this.width,this.height),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.normalMaterial=new Am,this.normalMaterial.blending=Ze,this.pdMaterial=new le({defines:Object.assign({},Qa.defines),uniforms:Hn.clone(Qa.uniforms),vertexShader:Qa.vertexShader,fragmentShader:Qa.fragmentShader,depthTest:!1,depthWrite:!1}),this.pdMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.pdMaterial.uniforms.tNoise.value=this.pdNoiseTexture,this.pdMaterial.uniforms.resolution.value.set(this.width,this.height),this.pdMaterial.uniforms.lumaPhi.value=10,this.pdMaterial.uniforms.depthPhi.value=2,this.pdMaterial.uniforms.normalPhi.value=3,this.pdMaterial.uniforms.radius.value=8,this.depthRenderMaterial=new le({defines:Object.assign({},ja.defines),uniforms:Hn.clone(ja.uniforms),vertexShader:ja.vertexShader,fragmentShader:ja.fragmentShader,blending:Ze}),this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.copyMaterial=new le({uniforms:Hn.clone(Xi.uniforms),vertexShader:Xi.vertexShader,fragmentShader:Xi.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blendSrc:ho,blendDst:$s,blendEquation:Xn,blendSrcAlpha:co,blendDstAlpha:$s,blendEquationAlpha:Xn}),this.blendMaterial=new le({uniforms:Hn.clone(yc.uniforms),vertexShader:yc.vertexShader,fragmentShader:yc.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blending:nh,blendSrc:ho,blendDst:$s,blendEquation:Xn,blendSrcAlpha:co,blendDstAlpha:$s,blendEquationAlpha:Xn}),this._fsQuad=new $a(null),this._originalClearColor=new pt,this.setGBuffer(s?s.depthTexture:void 0,s?s.normalTexture:void 0),a!==void 0&&this.updateGtaoMaterial(a),o!==void 0&&this.updatePdMaterial(o)}setSize(t,e){this.width=t,this.height=e,this.gtaoRenderTarget.setSize(t,e),this.normalRenderTarget.setSize(t,e),this.pdRenderTarget.setSize(t,e),this.gtaoMaterial.uniforms.resolution.value.set(t,e),this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.pdMaterial.uniforms.resolution.value.set(t,e),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse)}dispose(){this.gtaoNoiseTexture.dispose(),this.pdNoiseTexture.dispose(),this.normalRenderTarget.dispose(),this.gtaoRenderTarget.dispose(),this.pdRenderTarget.dispose(),this.normalMaterial.dispose(),this.pdMaterial.dispose(),this.copyMaterial.dispose(),this.depthRenderMaterial.dispose(),this._fsQuad.dispose()}get gtaoMap(){return this.pdRenderTarget.texture}setGBuffer(t,e){t!==void 0?(this.depthTexture=t,this.normalTexture=e,this._renderGBuffer=!1):(this.depthTexture=new ys,this.depthTexture.format=yi,this.depthTexture.type=ts,this.normalRenderTarget=new $e(this.width,this.height,{minFilter:Ue,magFilter:Ue,type:Je,depthTexture:this.depthTexture}),this.normalTexture=this.normalRenderTarget.texture,this._renderGBuffer=!0);const n=this.normalTexture?1:0,i=this.depthTexture===this.normalTexture?"w":"x";this.gtaoMaterial.defines.NORMAL_VECTOR_TYPE=n,this.gtaoMaterial.defines.DEPTH_SWIZZLING=i,this.gtaoMaterial.uniforms.tNormal.value=this.normalTexture,this.gtaoMaterial.uniforms.tDepth.value=this.depthTexture,this.pdMaterial.defines.NORMAL_VECTOR_TYPE=n,this.pdMaterial.defines.DEPTH_SWIZZLING=i,this.pdMaterial.uniforms.tNormal.value=this.normalTexture,this.pdMaterial.uniforms.tDepth.value=this.depthTexture,this.depthRenderMaterial.uniforms.tDepth.value=this.normalRenderTarget.depthTexture}setSceneClipBox(t){t?(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX!==1,this.gtaoMaterial.defines.SCENE_CLIP_BOX=1,this.gtaoMaterial.uniforms.sceneBoxMin.value.copy(t.min),this.gtaoMaterial.uniforms.sceneBoxMax.value.copy(t.max)):(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX===0,this.gtaoMaterial.defines.SCENE_CLIP_BOX=0)}updateGtaoMaterial(t){t.radius!==void 0&&(this.gtaoMaterial.uniforms.radius.value=t.radius),t.distanceExponent!==void 0&&(this.gtaoMaterial.uniforms.distanceExponent.value=t.distanceExponent),t.thickness!==void 0&&(this.gtaoMaterial.uniforms.thickness.value=t.thickness),t.distanceFallOff!==void 0&&(this.gtaoMaterial.uniforms.distanceFallOff.value=t.distanceFallOff,this.gtaoMaterial.needsUpdate=!0),t.scale!==void 0&&(this.gtaoMaterial.uniforms.scale.value=t.scale),t.samples!==void 0&&t.samples!==this.gtaoMaterial.defines.SAMPLES&&(this.gtaoMaterial.defines.SAMPLES=t.samples,this.gtaoMaterial.needsUpdate=!0),t.screenSpaceRadius!==void 0&&(t.screenSpaceRadius?1:0)!==this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS&&(this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS=t.screenSpaceRadius?1:0,this.gtaoMaterial.needsUpdate=!0)}updatePdMaterial(t){let e=!1;t.lumaPhi!==void 0&&(this.pdMaterial.uniforms.lumaPhi.value=t.lumaPhi),t.depthPhi!==void 0&&(this.pdMaterial.uniforms.depthPhi.value=t.depthPhi),t.normalPhi!==void 0&&(this.pdMaterial.uniforms.normalPhi.value=t.normalPhi),t.radius!==void 0&&t.radius!==this.radius&&(this.pdMaterial.uniforms.radius.value=t.radius),t.radiusExponent!==void 0&&t.radiusExponent!==this.pdRadiusExponent&&(this.pdRadiusExponent=t.radiusExponent,e=!0),t.rings!==void 0&&t.rings!==this.pdRings&&(this.pdRings=t.rings,e=!0),t.samples!==void 0&&t.samples!==this.pdSamples&&(this.pdSamples=t.samples,e=!0),e&&(this.pdMaterial.defines.SAMPLES=this.pdSamples,this.pdMaterial.defines.SAMPLE_VECTORS=If(this.pdSamples,this.pdRings,this.pdRadiusExponent),this.pdMaterial.needsUpdate=!0)}render(t,e,n){switch(this._renderGBuffer&&(this._overrideVisibility(),this._renderOverride(t,this.normalMaterial,this.normalRenderTarget,7829503,1),this._restoreVisibility()),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.gtaoMaterial.uniforms.cameraWorldMatrix.value.copy(this.camera.matrixWorld),this._renderPass(t,this.gtaoMaterial,this.gtaoRenderTarget,16777215,1),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this._renderPass(t,this.pdMaterial,this.pdRenderTarget,16777215,1),this.output){case ni.OUTPUT.Off:break;case ni.OUTPUT.Diffuse:this.copyMaterial.uniforms.tDiffuse.value=n.texture,this.copyMaterial.blending=Ze,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:e);break;case ni.OUTPUT.AO:this.copyMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.copyMaterial.blending=Ze,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:e);break;case ni.OUTPUT.Denoise:this.copyMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.copyMaterial.blending=Ze,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:e);break;case ni.OUTPUT.Depth:this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this._renderPass(t,this.depthRenderMaterial,this.renderToScreen?null:e);break;case ni.OUTPUT.Normal:this.copyMaterial.uniforms.tDiffuse.value=this.normalRenderTarget.texture,this.copyMaterial.blending=Ze,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:e);break;case ni.OUTPUT.Default:this.copyMaterial.uniforms.tDiffuse.value=n.texture,this.copyMaterial.blending=Ze,this._renderPass(t,this.copyMaterial,this.renderToScreen?null:e),this.blendMaterial.uniforms.intensity.value=this.blendIntensity,this.blendMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this._renderPass(t,this.blendMaterial,this.renderToScreen?null:e);break;default:console.warn("THREE.GTAOPass: Unknown output type.")}}_renderPass(t,e,n,i,s){t.getClearColor(this._originalClearColor);const a=t.getClearAlpha(),o=t.autoClear;t.setRenderTarget(n),t.autoClear=!1,i!=null&&(t.setClearColor(i),t.setClearAlpha(s||0),t.clear()),this._fsQuad.material=e,this._fsQuad.render(t),t.autoClear=o,t.setClearColor(this._originalClearColor),t.setClearAlpha(a)}_renderOverride(t,e,n,i,s){t.getClearColor(this._originalClearColor);const a=t.getClearAlpha(),o=t.autoClear;t.setRenderTarget(n),t.autoClear=!1,i=e.clearColor||i,s=e.clearAlpha||s,i!=null&&(t.setClearColor(i),t.setClearAlpha(s||0),t.clear()),this.scene.overrideMaterial=e,t.render(this.scene,this.camera),this.scene.overrideMaterial=null,t.autoClear=o,t.setClearColor(this._originalClearColor),t.setClearAlpha(a)}_overrideVisibility(){const t=this.scene,e=this._visibilityCache;t.traverse(function(n){(n.isPoints||n.isLine||n.isLine2)&&n.visible&&(n.visible=!1,e.push(n))})}_restoreVisibility(){const t=this._visibilityCache;for(let e=0;e<t.length;e++)t[e].visible=!0;t.length=0}_generateNoise(t=64){const e=new eM,n=t*t*4,i=new Uint8Array(n);for(let a=0;a<t;a++)for(let o=0;o<t;o++){const l=a,c=o;i[(a*t+o)*4]=(e.noise(l,c)*.5+.5)*255,i[(a*t+o)*4+1]=(e.noise(l+t,c)*.5+.5)*255,i[(a*t+o)*4+2]=(e.noise(l,c+t)*.5+.5)*255,i[(a*t+o)*4+3]=(e.noise(l+t,c+t)*.5+.5)*255}const s=new _s(i,t,t,gn,sn);return s.wrapS=hn,s.wrapT=hn,s.needsUpdate=!0,s}}ni.OUTPUT={Off:-1,Default:0,Diffuse:1,Depth:2,Normal:3,AO:4,Denoise:5};class to extends Xt{constructor(t,e={}){super(t),this.isReflector=!0,this.type="Reflector",this.forceUpdate=!1,this._reflectionCameras=new WeakMap;const n=this,i=e.color!==void 0?new pt(e.color):new pt(8355711),s=e.textureWidth||512,a=e.textureHeight||512,o=e.clipBias||0,l=e.shader||to.ReflectorShader,c=e.multisample!==void 0?e.multisample:4,h=new Kn,d=new L,u=new L,f=new L,m=new It,_=new L(0,0,-1),p=new ue,g=new L,v=new L,M=new ue,x=new It,b=new $e(s,a,{samples:c,type:Je}),S=new le({name:l.name!==void 0?l.name:"unspecified",uniforms:Hn.clone(l.uniforms),fragmentShader:l.fragmentShader,vertexShader:l.vertexShader});S.uniforms.tDiffuse.value=b.texture,S.uniforms.color.value=i,S.uniforms.textureMatrix.value=x,this.material=S,this.onBeforeRender=function(T,y,A){const E=this.getReflectionCamera(A);if(u.setFromMatrixPosition(n.matrixWorld),f.setFromMatrixPosition(A.matrixWorld),m.extractRotation(n.matrixWorld),d.set(0,0,1),d.applyMatrix4(m),g.subVectors(u,f),g.dot(d)>0===!0&&this.forceUpdate===!1)return;g.reflect(d).negate(),g.add(u),m.extractRotation(A.matrixWorld),_.set(0,0,-1),_.applyMatrix4(m),_.add(f),v.subVectors(u,_),v.reflect(d).negate(),v.add(u),E.position.copy(g),E.up.set(0,1,0),E.up.applyMatrix4(m),E.up.reflect(d),E.lookAt(v),E.far=A.far,E.updateMatrixWorld(),E.projectionMatrix.copy(A.projectionMatrix),x.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),x.multiply(E.projectionMatrix),x.multiply(E.matrixWorldInverse),x.multiply(n.matrixWorld),h.setFromNormalAndCoplanarPoint(d,u),h.applyMatrix4(E.matrixWorldInverse),p.set(h.normal.x,h.normal.y,h.normal.z,h.constant);const D=E.projectionMatrix;E.isOrthographicCamera?(M.x=(Math.sign(p.x)+D.elements[8])/D.elements[0],M.y=(Math.sign(p.y)+D.elements[9])/D.elements[5],M.z=-A.far,M.w=1):(M.x=(Math.sign(p.x)+D.elements[8])/D.elements[0],M.y=(Math.sign(p.y)+D.elements[9])/D.elements[5],M.z=-1,M.w=(1+D.elements[10])/D.elements[14]),p.multiplyScalar(2/p.dot(M)),D.elements[2]=p.x,D.elements[6]=p.y,E.isOrthographicCamera?(D.elements[10]=p.z-o,D.elements[14]=p.w-1):(D.elements[10]=p.z+1-o,D.elements[14]=p.w),n.visible=!1;const N=T.getRenderTarget(),R=T.xr.enabled,B=T.shadowMap.autoUpdate;T.xr.enabled=!1,T.shadowMap.autoUpdate=!1,T.setRenderTarget(b),T.state.buffers.depth.setMask(!0),T.autoClear===!1&&T.clear(),T.render(y,E),T.xr.enabled=R,T.shadowMap.autoUpdate=B,T.setRenderTarget(N);const V=A.viewport;V!==void 0&&T.state.viewport(V),n.visible=!0,this.forceUpdate=!1},this.getRenderTarget=function(){return b},this.dispose=function(){b.dispose(),n.material.dispose()},this.getReflectionCamera=function(T){let y=this._reflectionCameras.get(T);return y===void 0&&(y=T.clone(),this._reflectionCameras.set(T,y)),y}}}to.ReflectorShader={name:"ReflectorShader",uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null}},vertexShader:`
		uniform mat4 textureMatrix;
		varying vec4 vUv;

		#include <common>
		#include <logdepthbuf_pars_vertex>

		void main() {

			vUv = textureMatrix * vec4( position, 1.0 );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

			#include <logdepthbuf_vertex>

		}`,fragmentShader:`
		uniform vec3 color;
		uniform sampler2D tDiffuse;
		varying vec4 vUv;

		#include <logdepthbuf_pars_fragment>

		float blendOverlay( float base, float blend ) {

			return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );

		}

		vec3 blendOverlay( vec3 base, vec3 blend ) {

			return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );

		}

		void main() {

			#include <logdepthbuf_fragment>

			vec4 base = texture2DProj( tDiffuse, vUv );
			gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>

		}`};const nM={name:"miami",skyTop:"#2b1f6b",skyMid:"#e0529c",skyHorizon:"#ffb072",fog:"#ffa98a",hemiSky:"#ffc9e6",hemiGround:"#9a80d6",hemiIntensity:.55,sunColor:"#ffd9bd",sunIntensity:2.4,sunAzimuthDeg:-60,sunElevationDeg:16,skySunAzimuthDeg:43,exposure:1.18,water:{deep:"#1a86c4",shallow:"#52dbe0",sky:"#ff9ccf"},waterFog:[1500,4200],skyImage:"dusk",skyGrade:{top:"#6b3fb0",horizon:"#ff9a6b",amount:.62},ground:{sea:[28,110,150],sand:[250,232,200],lawn:[118,208,156],grass:[84,180,132],rock:[190,150,170]},neon:!0,vegetation:"palm",trunk:"#a98462",foliage:"#2fbf77",streetTreeSpacing:17,harnesses:{"claude-code":{wall:"#ffd2c4",roof:"#ff6f9f",accent:"#ff6f6f",park:"#7fd6a4"},codex:{wall:"#c4f4f6",roof:"#3cc3d2",accent:"#27c4d6",park:"#7fd6a4"},dsh:{wall:"#c8f7e0",roof:"#45d0a2",accent:"#34d29c",park:"#7fd6a4"},"plugin:zcode":{wall:"#e3d2ff",roof:"#9a6cf5",accent:"#9a6bff",park:"#7fd6a4"},"minimax-code":{wall:"#ffc9ea",roof:"#ea58ac",accent:"#ff5cb8",park:"#7fd6a4"}},fallback:{wall:"#f6e6cf",roof:"#d9a98c",accent:"#e8a07a",park:"#86d6a6"}};function Sc(r){return(r.skySunAzimuthDeg-r.sunAzimuthDeg)/360}function ce(){return nM}const Lf={tropical:{ground:{sand:[255,241,208],lawn:[104,204,138],grass:[74,178,118]},groundAmount:.75,water:{shallow:"#5fe0d0",deep:"#0f8fb8"},waterAmount:.65},temperate:{ground:{},groundAmount:0,water:null,waterAmount:0},boreal:{ground:{sand:[170,162,146],lawn:[84,118,92],grass:[62,96,74],rock:[128,128,126]},groundAmount:.8,water:{shallow:"#7da4b4",deep:"#1c4258"},waterAmount:.65},savanna:{ground:{sand:[228,192,128],lawn:[186,172,98],grass:[164,150,84],rock:[168,128,96]},groundAmount:.8,water:{shallow:"#7cc7b0",deep:"#2f7f78"},waterAmount:.6},eastasian:{ground:{lawn:[118,176,108],grass:[92,150,96]},groundAmount:.7,water:{shallow:"#8fd6bf",deep:"#2c8a86"},waterAmount:.65}};function iM(r,t){const e=Lf[t];if(!e||!e.groundAmount)return r.ground;const n=(i,s)=>s?[i[0]+(s[0]-i[0])*e.groundAmount,i[1]+(s[1]-i[1])*e.groundAmount,i[2]+(s[2]-i[2])*e.groundAmount]:i;return{sea:r.ground.sea,sand:n(r.ground.sand,e.ground.sand),lawn:n(r.ground.lawn,e.ground.lawn),grass:n(r.ground.grass,e.ground.grass),rock:n(r.ground.rock,e.ground.rock)}}var sM=""+new URL("sky-day-DsUYkHks.jpg",self.location.href).href,rM=""+new URL("sky-dusk-DSNBmG6c.jpg",self.location.href).href,aM=""+new URL("ground-asphalt-02-color-BhE3js6e.jpg",self.location.href).href,oM=""+new URL("ground-asphalt-02-normal-DPv0hN4H.jpg",self.location.href).href,lM=""+new URL("ground-concrete-pavement-02-color-DRU_d7tg.jpg",self.location.href).href,cM=""+new URL("ground-concrete-pavement-02-normal-m8ZlwENj.jpg",self.location.href).href,hM=""+new URL("ground-coast-sand-01-color-AHSd4EQa.jpg",self.location.href).href,uM=""+new URL("ground-coast-sand-01-normal-DBCTmcYI.jpg",self.location.href).href,fM=""+new URL("ground-brown-mud-02-color-BjjqeKTs.jpg",self.location.href).href,dM=""+new URL("ground-brown-mud-02-normal-DxFqgKtH.jpg",self.location.href).href,pM=""+new URL("ground-aerial-grass-rock-color-C-dQy7KR.jpg",self.location.href).href,mM=""+new URL("ground-aerial-grass-rock-normal-XalvtT5d.jpg",self.location.href).href,gM=""+new URL("facade-glass-Cp7NdxSs.jpg",self.location.href).href,xM=""+new URL("facade-commercial-CsukDcwb.jpg",self.location.href).href,vM=""+new URL("facade-banded-CmkM4c_w.jpg",self.location.href).href,_M=""+new URL("stucco-normal-C8Fw9Ngo.jpg",self.location.href).href,MM=""+new URL("water-normal-DZ6Y1iJI.jpg",self.location.href).href;let eo=null;function yM(){if(eo)return eo;const r=typeof document>"u",t=r?new Wu().setOptions({imageOrientation:"flipY"}):null,e=r?null:new Ou,n=(a,o,l=!0)=>(t?t.loadAsync(a).then(c=>{const h=new Re(c);return h.flipY=!1,h.needsUpdate=!0,h}):e.loadAsync(a)).then(c=>(c.colorSpace=o?Fe:ci,l&&(c.wrapS=c.wrapT=hn),c.anisotropy=8,c)),i=a=>n(a,!0,!1).then(o=>(o.mapping=Xr,o.wrapS=hn,o)),s=(a,o)=>Promise.all([n(a,!0),n(o,!1)]).then(([l,c])=>({color:l,normal:c}));return eo=Promise.all([i(sM),i(rM),s(aM,oM),s(lM,cM),s(hM,uM),s(fM,dM),s(pM,mM),n(vM,!0),n(xM,!0),n(gM,!0),n(_M,!1),n(MM,!1)]).then(([a,o,l,c,h,d,u,f,m,_,p,g])=>({sky:{day:a,dusk:o},ground:{asphalt:l,concrete:c,sand:h,mud:d,grass:u},facades:[f,m,_],stuccoNormal:p,waterNormal:g})).catch(a=>(console.warn("[city] texture assets unavailable, keeping procedural look",a),null)),eo}function bc(r,t=!1){const e=r[0].index!==null,n=new Set(Object.keys(r[0].attributes)),i=new Set(Object.keys(r[0].morphAttributes)),s={},a={},o=r[0].morphTargetsRelative,l=new ve;let c=0;for(let h=0;h<r.length;++h){const d=r[h];let u=0;if(e!==(d.index!==null))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them."),null;for(const f in d.attributes){if(!n.has(f))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+'. All geometries must have compatible attributes; make sure "'+f+'" attribute exists among all geometries, or in none of them.'),null;s[f]===void 0&&(s[f]=[]),s[f].push(d.attributes[f]),u++}if(u!==n.size)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". Make sure all geometries have the same number of attributes."),null;if(o!==d.morphTargetsRelative)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". .morphTargetsRelative must be consistent throughout all geometries."),null;for(const f in d.morphAttributes){if(!i.has(f))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+".  .morphAttributes must be consistent throughout all geometries."),null;a[f]===void 0&&(a[f]=[]),a[f].push(d.morphAttributes[f])}if(t){let f;if(e)f=d.index.count;else if(d.attributes.position!==void 0)f=d.attributes.position.count;else return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". The geometry must have either an index or a position attribute"),null;l.addGroup(c,f,h),c+=f}}if(e){let h=0;const d=[];for(let u=0;u<r.length;++u){const f=r[u].index;for(let m=0;m<f.count;++m)d.push(f.getX(m)+h);h+=r[u].attributes.position.count}l.setIndex(d)}for(const h in s){const d=Df(s[h]);if(!d)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+h+" attribute."),null;l.setAttribute(h,d)}for(const h in a){const d=a[h][0].length;if(d!==0){l.morphAttributes=l.morphAttributes||{},l.morphAttributes[h]=[];for(let u=0;u<d;++u){const f=[];for(let _=0;_<a[h].length;++_)f.push(a[h][_][u]);const m=Df(f);if(!m)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+h+" morphAttribute."),null;l.morphAttributes[h].push(m)}}}return l}function Df(r){let t,e,n,i=-1,s=0;for(let c=0;c<r.length;++c){const h=r[c];if(t===void 0&&(t=h.array.constructor),t!==h.array.constructor)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes."),null;if(e===void 0&&(e=h.itemSize),e!==h.itemSize)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes."),null;if(n===void 0&&(n=h.normalized),n!==h.normalized)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes."),null;if(i===-1&&(i=h.gpuType),i!==h.gpuType)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes."),null;s+=h.count*e}const a=new t(s),o=new Pe(a,e,n);let l=0;for(let c=0;c<r.length;++c){const h=r[c];if(h.isInterleavedBufferAttribute){const d=l/e;for(let u=0,f=h.count;u<f;u++)for(let m=0;m<e;m++){const _=h.getComponent(u,m);o.setComponent(u+d,m,_)}}else a.set(h.array,l);l+=h.count*e}return i!==void 0&&(o.gpuType=i),o}function Uf(r,t){if(t===Bd)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),r;if(t===hl||t===vh){let e=r.getIndex();if(e===null){const s=[],a=r.getAttribute("position");if(a!==void 0){for(let o=0;o<a.count;o++)s.push(o);r.setIndex(s),e=r.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),r}const n=e.count-2,i=[];if(t===hl)for(let s=1;s<=n;s++)i.push(e.getX(0)),i.push(e.getX(s)),i.push(e.getX(s+1));else for(let s=0;s<n;s++)s%2===0?(i.push(e.getX(s)),i.push(e.getX(s+1)),i.push(e.getX(s+2))):(i.push(e.getX(s+2)),i.push(e.getX(s+1)),i.push(e.getX(s)));return i.length/3!==n&&console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles."),r.setIndex(i),r.clearGroups(),r}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",t),r}function SM(r){const t=new Map,e=new Map,n=r.clone();return Nf(r,n,function(i,s){t.set(s,i),e.set(i,s)}),n.traverse(function(i){if(!i.isSkinnedMesh)return;const s=i,a=t.get(i),o=a.skeleton.bones;s.skeleton=a.skeleton.clone(),s.bindMatrix.copy(a.bindMatrix),s.skeleton.bones=o.map(function(l){return e.get(l)}),s.bind(s.skeleton,s.bindMatrix)}),n}function Nf(r,t,e){e(r,t);for(let n=0;n<r.children.length;n++)Nf(r.children[n],t.children[n],e)}class bM extends Es{constructor(t){super(t),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(e){return new CM(e)}),this.register(function(e){return new RM(e)}),this.register(function(e){return new OM(e)}),this.register(function(e){return new BM(e)}),this.register(function(e){return new kM(e)}),this.register(function(e){return new IM(e)}),this.register(function(e){return new LM(e)}),this.register(function(e){return new DM(e)}),this.register(function(e){return new UM(e)}),this.register(function(e){return new EM(e)}),this.register(function(e){return new NM(e)}),this.register(function(e){return new PM(e)}),this.register(function(e){return new zM(e)}),this.register(function(e){return new FM(e)}),this.register(function(e){return new AM(e)}),this.register(function(e){return new Ff(e,te.EXT_MESHOPT_COMPRESSION)}),this.register(function(e){return new Ff(e,te.KHR_MESHOPT_COMPRESSION)}),this.register(function(e){return new VM(e)})}load(t,e,n,i){const s=this;let a;if(this.resourcePath!=="")a=this.resourcePath;else if(this.path!==""){const c=Ur.extractUrlBase(t);a=Ur.resolveURL(c,this.path)}else a=Ur.extractUrlBase(t);this.manager.itemStart(t);const o=function(c){i?i(c):console.error(c),s.manager.itemError(t),s.manager.itemEnd(t)},l=new zu(this.manager);l.setPath(this.path),l.setResponseType("arraybuffer"),l.setRequestHeader(this.requestHeader),l.setWithCredentials(this.withCredentials),l.load(t,function(c){try{s.parse(c,a,function(h){e(h),s.manager.itemEnd(t)},o)}catch(h){o(h)}},n,o)}setDRACOLoader(t){return this.dracoLoader=t,this}setKTX2Loader(t){return this.ktx2Loader=t,this}setMeshoptDecoder(t){return this.meshoptDecoder=t,this}register(t){return this.pluginCallbacks.indexOf(t)===-1&&this.pluginCallbacks.push(t),this}unregister(t){return this.pluginCallbacks.indexOf(t)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(t),1),this}parse(t,e,n,i){let s;const a={},o={},l=new TextDecoder;if(typeof t=="string")s=JSON.parse(t);else if(t instanceof ArrayBuffer)if(l.decode(new Uint8Array(t,0,4))===zf){try{a[te.KHR_BINARY_GLTF]=new HM(t)}catch(d){i&&i(d);return}s=JSON.parse(a[te.KHR_BINARY_GLTF].content)}else s=JSON.parse(l.decode(t));else s=t;if(s.asset===void 0||s.asset.version[0]<2){i&&i(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}const c=new ey(s,{path:e||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});c.fileLoader.setRequestHeader(this.requestHeader);for(let h=0;h<this.pluginCallbacks.length;h++){const d=this.pluginCallbacks[h](c);d.name||console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),o[d.name]=d,a[d.name]=!0}if(s.extensionsUsed)for(let h=0;h<s.extensionsUsed.length;++h){const d=s.extensionsUsed[h],u=s.extensionsRequired||[];switch(d){case te.KHR_MATERIALS_UNLIT:a[d]=new TM;break;case te.KHR_DRACO_MESH_COMPRESSION:a[d]=new GM(s,this.dracoLoader);break;case te.KHR_TEXTURE_TRANSFORM:a[d]=new WM;break;case te.KHR_MESH_QUANTIZATION:a[d]=new XM;break;default:u.indexOf(d)>=0&&o[d]===void 0&&console.warn('THREE.GLTFLoader: Unknown extension "'+d+'".')}}c.setExtensions(a),c.setPlugins(o),c.parse(n,i)}parseAsync(t,e){const n=this;return new Promise(function(i,s){n.parse(t,e,i,s)})}}function wM(){let r={};return{get:function(t){return r[t]},add:function(t,e){r[t]=e},remove:function(t){delete r[t]},removeAll:function(){r={}}}}function Oe(r,t,e){const n=r.json.materials[t];return n.extensions&&n.extensions[e]?n.extensions[e]:null}const te={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",KHR_MESHOPT_COMPRESSION:"KHR_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"};class AM{constructor(t){this.parser=t,this.name=te.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){const t=this.parser,e=this.parser.json.nodes||[];for(let n=0,i=e.length;n<i;n++){const s=e[n];s.extensions&&s.extensions[this.name]&&s.extensions[this.name].light!==void 0&&t._addNodeRef(this.cache,s.extensions[this.name].light)}}_loadLight(t){const e=this.parser,n="light:"+t;let i=e.cache.get(n);if(i)return i;const s=e.json,l=((s.extensions&&s.extensions[this.name]||{}).lights||[])[t];let c;const h=new pt(16777215);l.color!==void 0&&h.setRGB(l.color[0],l.color[1],l.color[2],xn);const d=l.range!==void 0?l.range:0;switch(l.type){case"directional":c=new Ha(h),c.target.position.set(0,0,-1),c.add(c.target);break;case"point":c=new Zm(h),c.distance=d;break;case"spot":c=new Ym(h),c.distance=d,l.spot=l.spot||{},l.spot.innerConeAngle=l.spot.innerConeAngle!==void 0?l.spot.innerConeAngle:0,l.spot.outerConeAngle=l.spot.outerConeAngle!==void 0?l.spot.outerConeAngle:Math.PI/4,c.angle=l.spot.outerConeAngle,c.penumbra=1-l.spot.innerConeAngle/l.spot.outerConeAngle,c.target.position.set(0,0,-1),c.add(c.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+l.type)}return c.position.set(0,0,0),ii(c,l),l.intensity!==void 0&&(c.intensity=l.intensity),c.name=e.createUniqueName(l.name||"light_"+t),i=Promise.resolve(c),e.cache.add(n,i),i}getDependency(t,e){if(t==="light")return this._loadLight(e)}createNodeAttachment(t){const e=this,n=this.parser,s=n.json.nodes[t],o=(s.extensions&&s.extensions[this.name]||{}).light;return o===void 0?null:this._loadLight(o).then(function(l){return n._getNodeRef(e.cache,o,l)})}}class TM{constructor(){this.name=te.KHR_MATERIALS_UNLIT}getMaterialType(){return Te}extendParams(t,e,n){const i=[];t.color=new pt(1,1,1),t.opacity=1;const s=e.pbrMetallicRoughness;if(s){if(Array.isArray(s.baseColorFactor)){const a=s.baseColorFactor;t.color.setRGB(a[0],a[1],a[2],xn),t.opacity=a[3]}s.baseColorTexture!==void 0&&i.push(n.assignTexture(t,"map",s.baseColorTexture,Fe))}return Promise.all(i)}}class EM{constructor(t){this.parser=t,this.name=te.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(t,e){const n=Oe(this.parser,t,this.name);return n===null||n.emissiveStrength!==void 0&&(e.emissiveIntensity=n.emissiveStrength),Promise.resolve()}}class CM{constructor(t){this.parser=t,this.name=te.KHR_MATERIALS_CLEARCOAT}getMaterialType(t){return Oe(this.parser,t,this.name)!==null?jn:null}extendMaterialParams(t,e){const n=Oe(this.parser,t,this.name);if(n===null)return Promise.resolve();const i=[];if(n.clearcoatFactor!==void 0&&(e.clearcoat=n.clearcoatFactor),n.clearcoatTexture!==void 0&&i.push(this.parser.assignTexture(e,"clearcoatMap",n.clearcoatTexture)),n.clearcoatRoughnessFactor!==void 0&&(e.clearcoatRoughness=n.clearcoatRoughnessFactor),n.clearcoatRoughnessTexture!==void 0&&i.push(this.parser.assignTexture(e,"clearcoatRoughnessMap",n.clearcoatRoughnessTexture)),n.clearcoatNormalTexture!==void 0&&(i.push(this.parser.assignTexture(e,"clearcoatNormalMap",n.clearcoatNormalTexture)),n.clearcoatNormalTexture.scale!==void 0)){const s=n.clearcoatNormalTexture.scale;e.clearcoatNormalScale=new ft(s,s)}return Promise.all(i)}}class RM{constructor(t){this.parser=t,this.name=te.KHR_MATERIALS_DISPERSION}getMaterialType(t){return Oe(this.parser,t,this.name)!==null?jn:null}extendMaterialParams(t,e){const n=Oe(this.parser,t,this.name);return n===null||(e.dispersion=n.dispersion!==void 0?n.dispersion:0),Promise.resolve()}}class PM{constructor(t){this.parser=t,this.name=te.KHR_MATERIALS_IRIDESCENCE}getMaterialType(t){return Oe(this.parser,t,this.name)!==null?jn:null}extendMaterialParams(t,e){const n=Oe(this.parser,t,this.name);if(n===null)return Promise.resolve();const i=[];return n.iridescenceFactor!==void 0&&(e.iridescence=n.iridescenceFactor),n.iridescenceTexture!==void 0&&i.push(this.parser.assignTexture(e,"iridescenceMap",n.iridescenceTexture)),n.iridescenceIor!==void 0&&(e.iridescenceIOR=n.iridescenceIor),e.iridescenceThicknessRange===void 0&&(e.iridescenceThicknessRange=[100,400]),n.iridescenceThicknessMinimum!==void 0&&(e.iridescenceThicknessRange[0]=n.iridescenceThicknessMinimum),n.iridescenceThicknessMaximum!==void 0&&(e.iridescenceThicknessRange[1]=n.iridescenceThicknessMaximum),n.iridescenceThicknessTexture!==void 0&&i.push(this.parser.assignTexture(e,"iridescenceThicknessMap",n.iridescenceThicknessTexture)),Promise.all(i)}}class IM{constructor(t){this.parser=t,this.name=te.KHR_MATERIALS_SHEEN}getMaterialType(t){return Oe(this.parser,t,this.name)!==null?jn:null}extendMaterialParams(t,e){const n=Oe(this.parser,t,this.name);if(n===null)return Promise.resolve();const i=[];if(e.sheenColor=new pt(0,0,0),e.sheenRoughness=0,e.sheen=1,n.sheenColorFactor!==void 0){const s=n.sheenColorFactor;e.sheenColor.setRGB(s[0],s[1],s[2],xn)}return n.sheenRoughnessFactor!==void 0&&(e.sheenRoughness=n.sheenRoughnessFactor),n.sheenColorTexture!==void 0&&i.push(this.parser.assignTexture(e,"sheenColorMap",n.sheenColorTexture,Fe)),n.sheenRoughnessTexture!==void 0&&i.push(this.parser.assignTexture(e,"sheenRoughnessMap",n.sheenRoughnessTexture)),Promise.all(i)}}class LM{constructor(t){this.parser=t,this.name=te.KHR_MATERIALS_TRANSMISSION}getMaterialType(t){return Oe(this.parser,t,this.name)!==null?jn:null}extendMaterialParams(t,e){const n=Oe(this.parser,t,this.name);if(n===null)return Promise.resolve();const i=[];return n.transmissionFactor!==void 0&&(e.transmission=n.transmissionFactor),n.transmissionTexture!==void 0&&i.push(this.parser.assignTexture(e,"transmissionMap",n.transmissionTexture)),Promise.all(i)}}class DM{constructor(t){this.parser=t,this.name=te.KHR_MATERIALS_VOLUME}getMaterialType(t){return Oe(this.parser,t,this.name)!==null?jn:null}extendMaterialParams(t,e){const n=Oe(this.parser,t,this.name);if(n===null)return Promise.resolve();const i=[];e.thickness=n.thicknessFactor!==void 0?n.thicknessFactor:0,n.thicknessTexture!==void 0&&i.push(this.parser.assignTexture(e,"thicknessMap",n.thicknessTexture)),e.attenuationDistance=n.attenuationDistance||1/0;const s=n.attenuationColor||[1,1,1];return e.attenuationColor=new pt().setRGB(s[0],s[1],s[2],xn),Promise.all(i)}}class UM{constructor(t){this.parser=t,this.name=te.KHR_MATERIALS_IOR}getMaterialType(t){return Oe(this.parser,t,this.name)!==null?jn:null}extendMaterialParams(t,e){const n=Oe(this.parser,t,this.name);return n===null||(e.ior=n.ior!==void 0?n.ior:1.5,e.ior===0&&(e.ior=1e3)),Promise.resolve()}}class NM{constructor(t){this.parser=t,this.name=te.KHR_MATERIALS_SPECULAR}getMaterialType(t){return Oe(this.parser,t,this.name)!==null?jn:null}extendMaterialParams(t,e){const n=Oe(this.parser,t,this.name);if(n===null)return Promise.resolve();const i=[];e.specularIntensity=n.specularFactor!==void 0?n.specularFactor:1,n.specularTexture!==void 0&&i.push(this.parser.assignTexture(e,"specularIntensityMap",n.specularTexture));const s=n.specularColorFactor||[1,1,1];return e.specularColor=new pt().setRGB(s[0],s[1],s[2],xn),n.specularColorTexture!==void 0&&i.push(this.parser.assignTexture(e,"specularColorMap",n.specularColorTexture,Fe)),Promise.all(i)}}class FM{constructor(t){this.parser=t,this.name=te.EXT_MATERIALS_BUMP}getMaterialType(t){return Oe(this.parser,t,this.name)!==null?jn:null}extendMaterialParams(t,e){const n=Oe(this.parser,t,this.name);if(n===null)return Promise.resolve();const i=[];return e.bumpScale=n.bumpFactor!==void 0?n.bumpFactor:1,n.bumpTexture!==void 0&&i.push(this.parser.assignTexture(e,"bumpMap",n.bumpTexture)),Promise.all(i)}}class zM{constructor(t){this.parser=t,this.name=te.KHR_MATERIALS_ANISOTROPY}getMaterialType(t){return Oe(this.parser,t,this.name)!==null?jn:null}extendMaterialParams(t,e){const n=Oe(this.parser,t,this.name);if(n===null)return Promise.resolve();const i=[];return n.anisotropyStrength!==void 0&&(e.anisotropy=n.anisotropyStrength),n.anisotropyRotation!==void 0&&(e.anisotropyRotation=n.anisotropyRotation),n.anisotropyTexture!==void 0&&i.push(this.parser.assignTexture(e,"anisotropyMap",n.anisotropyTexture)),Promise.all(i)}}class OM{constructor(t){this.parser=t,this.name=te.KHR_TEXTURE_BASISU}loadTexture(t){const e=this.parser,n=e.json,i=n.textures[t];if(!i.extensions||!i.extensions[this.name])return null;const s=i.extensions[this.name],a=e.options.ktx2Loader;if(!a){if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return e.loadTextureImage(t,s.source,a)}}class BM{constructor(t){this.parser=t,this.name=te.EXT_TEXTURE_WEBP}loadTexture(t){const e=this.name,n=this.parser,i=n.json,s=i.textures[t];if(!s.extensions||!s.extensions[e])return null;const a=s.extensions[e],o=i.images[a.source];let l=n.textureLoader;if(o.uri){const c=n.options.manager.getHandler(o.uri);c!==null&&(l=c)}return n.loadTextureImage(t,a.source,l)}}class kM{constructor(t){this.parser=t,this.name=te.EXT_TEXTURE_AVIF}loadTexture(t){const e=this.name,n=this.parser,i=n.json,s=i.textures[t];if(!s.extensions||!s.extensions[e])return null;const a=s.extensions[e],o=i.images[a.source];let l=n.textureLoader;if(o.uri){const c=n.options.manager.getHandler(o.uri);c!==null&&(l=c)}return n.loadTextureImage(t,a.source,l)}}class Ff{constructor(t,e){this.name=e,this.parser=t}loadBufferView(t){const e=this.parser.json,n=e.bufferViews[t];if(n.extensions&&n.extensions[this.name]){const i=n.extensions[this.name],s=this.parser.getDependency("buffer",i.buffer),a=this.parser.options.meshoptDecoder;if(!a||!a.supported){if(e.extensionsRequired&&e.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return s.then(function(o){const l=i.byteOffset||0,c=i.byteLength||0,h=i.count,d=i.byteStride,u=new Uint8Array(o,l,c);return a.decodeGltfBufferAsync?a.decodeGltfBufferAsync(h,d,u,i.mode,i.filter).then(function(f){return f.buffer}):a.ready.then(function(){const f=new ArrayBuffer(h*d);return a.decodeGltfBuffer(new Uint8Array(f),h,d,u,i.mode,i.filter),f})})}else return null}}class VM{constructor(t){this.name=te.EXT_MESH_GPU_INSTANCING,this.parser=t}createNodeMesh(t){const e=this.parser.json,n=e.nodes[t];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;const i=e.meshes[n.mesh];for(const c of i.primitives)if(c.mode!==Pn.TRIANGLES&&c.mode!==Pn.TRIANGLE_STRIP&&c.mode!==Pn.TRIANGLE_FAN&&c.mode!==void 0)return null;const a=n.extensions[this.name].attributes,o=[],l={};for(const c in a)o.push(this.parser.getDependency("accessor",a[c]).then(h=>(l[c]=h,l[c])));return o.length<1?null:(o.push(this.parser.createNodeMesh(t)),Promise.all(o).then(c=>{const h=c.pop(),d=h.isGroup?h.children:[h],u=c[0].count,f=[];for(const m of d){const _=new It,p=new L,g=new He,v=new L(1,1,1),M=new De(m.geometry,m.material,u);for(let b=0;b<u;b++)l.TRANSLATION&&p.fromBufferAttribute(l.TRANSLATION,b),l.ROTATION&&g.fromBufferAttribute(l.ROTATION,b),l.SCALE&&v.fromBufferAttribute(l.SCALE,b),M.setMatrixAt(b,_.compose(p,g,v));let x=null;for(const b in l)if(b==="_COLOR_0"){const S=l[b];M.instanceColor=new Vi(S.array,S.itemSize,S.normalized)}else if(b!=="TRANSLATION"&&b!=="ROTATION"&&b!=="SCALE"){if(x===null){const T=M.geometry;x=new ve,x.name=T.name;for(const y in T.attributes)x.setAttribute(y,T.attributes[y]);for(const y in T.morphAttributes)x.morphAttributes[y]=T.morphAttributes[y];T.index!==null&&x.setIndex(T.index),x.morphTargetsRelative=T.morphTargetsRelative;for(const y of T.groups)x.addGroup(y.start,y.count,y.materialIndex);T.boundingBox!==null&&(x.boundingBox=T.boundingBox.clone()),T.boundingSphere!==null&&(x.boundingSphere=T.boundingSphere.clone()),x.drawRange.start=T.drawRange.start,x.drawRange.count=T.drawRange.count,x.userData=Object.assign({},T.userData),M.geometry=x}const S=l[b];x.setAttribute(b,new Vi(S.array,S.itemSize,S.normalized))}Ae.prototype.copy.call(M,m),this.parser.assignFinalMaterial(M),f.push(M)}return h.isGroup?(h.clear(),h.add(...f),h):f[0]}))}}const zf="glTF",Or=12,Of={JSON:1313821514,BIN:5130562};class HM{constructor(t){this.name=te.KHR_BINARY_GLTF,this.content=null,this.body=null;const e=new DataView(t,0,Or),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(t.slice(0,4))),version:e.getUint32(4,!0),length:e.getUint32(8,!0)},this.header.magic!==zf)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");const i=this.header.length-Or,s=new DataView(t,Or);let a=0;for(;a<i;){const o=s.getUint32(a,!0);a+=4;const l=s.getUint32(a,!0);if(a+=4,l===Of.JSON){const c=new Uint8Array(t,Or+a,o);this.content=n.decode(c)}else if(l===Of.BIN){const c=Or+a;this.body=t.slice(c,c+o)}a+=o}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}}class GM{constructor(t,e){if(!e)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=te.KHR_DRACO_MESH_COMPRESSION,this.json=t,this.dracoLoader=e,this.dracoLoader.preload()}decodePrimitive(t,e){const n=this.json,i=this.dracoLoader,s=t.extensions[this.name].bufferView,a=t.extensions[this.name].attributes,o={},l={},c={};for(const h in a){const d=Ac[h]||h.toLowerCase();o[d]=a[h]}for(const h in t.attributes){const d=Ac[h]||h.toLowerCase();if(a[h]!==void 0){const u=n.accessors[t.attributes[h]],f=Ns[u.componentType];c[d]=f.name,l[d]=u.normalized===!0}}return e.getDependency("bufferView",s).then(function(h){return new Promise(function(d,u){i.decodeDracoFile(h,function(f){for(const m in f.attributes){const _=f.attributes[m],p=l[m];p!==void 0&&(_.normalized=p)}d(f)},o,c,xn,u)})})}}class WM{constructor(){this.name=te.KHR_TEXTURE_TRANSFORM}extendTexture(t,e){if((e.texCoord===void 0||e.texCoord===t.channel)&&e.offset===void 0&&e.rotation===void 0&&e.scale===void 0)return t;if(t=t.clone(),e.texCoord!==void 0&&(t.channel=e.texCoord),e.offset!==void 0&&t.offset.fromArray(e.offset),e.rotation!==void 0&&(t.rotation=e.rotation),e.scale!==void 0&&t.repeat.fromArray(e.scale),e.rotation!==void 0){const n=Math.cos(t.rotation),i=Math.sin(t.rotation);t.matrix.set(t.repeat.x*n,t.repeat.y*i,t.offset.x,-t.repeat.x*i,t.repeat.y*n,t.offset.y,0,0,1),t.matrixAutoUpdate=!1}return t.needsUpdate=!0,t}}class XM{constructor(){this.name=te.KHR_MESH_QUANTIZATION}}class Bf extends ws{constructor(t,e,n,i){super(t,e,n,i)}copySampleValue_(t){const e=this.resultBuffer,n=this.sampleValues,i=this.valueSize,s=t*i*3+i;for(let a=0;a!==i;a++)e[a]=n[s+a];return e}interpolate_(t,e,n,i){const s=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=o*2,c=o*3,h=i-e,d=(n-e)/h,u=d*d,f=u*d,m=t*c,_=m-c,p=-2*f+3*u,g=f-u,v=1-p,M=g-u+d;for(let x=0;x!==o;x++){const b=a[_+x+o],S=a[_+x+l]*h,T=a[m+x+o],y=a[m+x]*h;s[x]=v*b+M*S+p*T+g*y}return s}}const YM=new He;class qM extends Bf{interpolate_(t,e,n,i){const s=super.interpolate_(t,e,n,i);return YM.fromArray(s).normalize().toArray(s),s}}const Pn={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6},Ns={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},kf={9728:Ue,9729:Ne,9984:oh,9985:Zr,9986:Js,9987:oi},Vf={33071:bn,33648:qr,10497:hn},wc={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},Ac={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},Pi={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},ZM={CUBICSPLINE:void 0,LINEAR:tr,STEP:Qs},Tc={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function $M(r){return r.DefaultMaterial===void 0&&(r.DefaultMaterial=new sc({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:Mi})),r.DefaultMaterial}function qi(r,t,e){for(const n in e.extensions)r[n]===void 0&&(t.userData.gltfExtensions=t.userData.gltfExtensions||{},t.userData.gltfExtensions[n]=e.extensions[n])}function ii(r,t){t.extras!==void 0&&(typeof t.extras=="object"?Object.assign(r.userData,t.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+t.extras))}function KM(r,t,e){let n=!1,i=!1,s=!1;for(let c=0,h=t.length;c<h;c++){const d=t[c];if(d.POSITION!==void 0&&(n=!0),d.NORMAL!==void 0&&(i=!0),d.COLOR_0!==void 0&&(s=!0),n&&i&&s)break}if(!n&&!i&&!s)return Promise.resolve(r);const a=[],o=[],l=[];for(let c=0,h=t.length;c<h;c++){const d=t[c];if(n){const u=d.POSITION!==void 0?e.getDependency("accessor",d.POSITION):r.attributes.position;a.push(u)}if(i){const u=d.NORMAL!==void 0?e.getDependency("accessor",d.NORMAL):r.attributes.normal;o.push(u)}if(s){const u=d.COLOR_0!==void 0?e.getDependency("accessor",d.COLOR_0):r.attributes.color;l.push(u)}}return Promise.all([Promise.all(a),Promise.all(o),Promise.all(l)]).then(function(c){const h=c[0],d=c[1],u=c[2];return n&&(r.morphAttributes.position=h),i&&(r.morphAttributes.normal=d),s&&(r.morphAttributes.color=u),r.morphTargetsRelative=!0,r})}function JM(r,t){if(r.updateMorphTargets(),t.weights!==void 0)for(let e=0,n=t.weights.length;e<n;e++)r.morphTargetInfluences[e]=t.weights[e];if(t.extras&&Array.isArray(t.extras.targetNames)){const e=t.extras.targetNames;if(r.morphTargetInfluences.length===e.length){r.morphTargetDictionary={};for(let n=0,i=e.length;n<i;n++)r.morphTargetDictionary[e[n]]=n}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function jM(r){let t;const e=r.extensions&&r.extensions[te.KHR_DRACO_MESH_COMPRESSION];if(e?t="draco:"+e.bufferView+":"+e.indices+":"+Ec(e.attributes):t=r.indices+":"+Ec(r.attributes)+":"+r.mode,r.targets!==void 0)for(let n=0,i=r.targets.length;n<i;n++)t+=":"+Ec(r.targets[n]);return t}function Ec(r){let t="";const e=Object.keys(r).sort();for(let n=0,i=e.length;n<i;n++)t+=e[n]+":"+r[e[n]]+";";return t}function Cc(r){switch(r){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function QM(r){return r.search(/\.jpe?g($|\?)/i)>0||r.search(/^data\:image\/jpeg/)===0?"image/jpeg":r.search(/\.webp($|\?)/i)>0||r.search(/^data\:image\/webp/)===0?"image/webp":r.search(/\.ktx2($|\?)/i)>0||r.search(/^data\:image\/ktx2/)===0?"image/ktx2":"image/png"}const ty=new It;class ey{constructor(t={},e={}){this.json=t,this.extensions={},this.plugins={},this.options=e,this.cache=new wM,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,i=-1,s=!1,a=-1;if(typeof navigator<"u"&&typeof navigator.userAgent<"u"){const o=navigator.userAgent;n=/^((?!chrome|android).)*safari/i.test(o)===!0;const l=o.match(/Version\/(\d+)/);i=n&&l?parseInt(l[1],10):-1,s=o.indexOf("Firefox")>-1,a=s?o.match(/Firefox\/([0-9]+)\./)[1]:-1}typeof createImageBitmap>"u"||n&&i<17||s&&a<98?this.textureLoader=new Ou(this.options.manager):this.textureLoader=new Wu(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new zu(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials"&&this.fileLoader.setWithCredentials(!0)}setExtensions(t){this.extensions=t}setPlugins(t){this.plugins=t}parse(t,e){const n=this,i=this.json,s=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(a){return a._markDefs&&a._markDefs()}),Promise.all(this._invokeAll(function(a){return a.beforeRoot&&a.beforeRoot()})).then(function(){return Promise.all([n.getDependencies("scene"),n.getDependencies("animation"),n.getDependencies("camera")])}).then(function(a){const o={scene:a[0][i.scene||0],scenes:a[0],animations:a[1],cameras:a[2],asset:i.asset,parser:n,userData:{}};return qi(s,o,i),ii(o,i),Promise.all(n._invokeAll(function(l){return l.afterRoot&&l.afterRoot(o)})).then(function(){for(const l of o.scenes)l.updateMatrixWorld();t(o)})}).catch(e)}_markDefs(){const t=this.json.nodes||[],e=this.json.skins||[],n=this.json.meshes||[];for(let i=0,s=e.length;i<s;i++){const a=e[i].joints;for(let o=0,l=a.length;o<l;o++)t[a[o]].isBone=!0}for(let i=0,s=t.length;i<s;i++){const a=t[i];a.mesh!==void 0&&(this._addNodeRef(this.meshCache,a.mesh),a.skin!==void 0&&(n[a.mesh].isSkinnedMesh=!0)),a.camera!==void 0&&this._addNodeRef(this.cameraCache,a.camera)}}_addNodeRef(t,e){e!==void 0&&(t.refs[e]===void 0&&(t.refs[e]=t.uses[e]=0),t.refs[e]++)}_getNodeRef(t,e,n){if(t.refs[e]<=1)return n;const i=n.clone(),s=(a,o)=>{const l=this.associations.get(a);l!=null&&this.associations.set(o,l);for(const[c,h]of a.children.entries())s(h,o.children[c])};return s(n,i),i.name+="_instance_"+t.uses[e]++,i}_invokeOne(t){const e=Object.values(this.plugins);e.push(this);for(let n=0;n<e.length;n++){const i=t(e[n]);if(i)return i}return null}_invokeAll(t){const e=Object.values(this.plugins);e.unshift(this);const n=[];for(let i=0;i<e.length;i++){const s=t(e[i]);s&&n.push(s)}return n}getDependency(t,e){const n=t+":"+e;let i=this.cache.get(n);if(!i){switch(t){case"scene":i=this.loadScene(e);break;case"node":i=this._invokeOne(function(s){return s.loadNode&&s.loadNode(e)});break;case"mesh":i=this._invokeOne(function(s){return s.loadMesh&&s.loadMesh(e)});break;case"accessor":i=this.loadAccessor(e);break;case"bufferView":i=this._invokeOne(function(s){return s.loadBufferView&&s.loadBufferView(e)});break;case"buffer":i=this.loadBuffer(e);break;case"material":i=this._invokeOne(function(s){return s.loadMaterial&&s.loadMaterial(e)});break;case"texture":i=this._invokeOne(function(s){return s.loadTexture&&s.loadTexture(e)});break;case"skin":i=this.loadSkin(e);break;case"animation":i=this._invokeOne(function(s){return s.loadAnimation&&s.loadAnimation(e)});break;case"camera":i=this.loadCamera(e);break;default:if(i=this._invokeOne(function(s){return s!=this&&s.getDependency&&s.getDependency(t,e)}),!i)throw new Error("Unknown type: "+t);break}this.cache.add(n,i)}return i}getDependencies(t){let e=this.cache.get(t);if(!e){const n=this,i=this.json[t+(t==="mesh"?"es":"s")]||[];e=Promise.all(i.map(function(s,a){return n.getDependency(t,a)})),this.cache.add(t,e)}return e}loadBuffer(t){const e=this.json.buffers[t],n=this.fileLoader;if(e.type&&e.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+e.type+" buffer type is not supported.");if(e.uri===void 0&&t===0)return Promise.resolve(this.extensions[te.KHR_BINARY_GLTF].body);const i=this.options;return new Promise(function(s,a){n.load(Ur.resolveURL(e.uri,i.path),s,void 0,function(){a(new Error('THREE.GLTFLoader: Failed to load buffer "'+e.uri+'".'))})})}loadBufferView(t){const e=this.json.bufferViews[t];return this.getDependency("buffer",e.buffer).then(function(n){const i=e.byteLength||0,s=e.byteOffset||0;return n.slice(s,s+i)})}loadAccessor(t){const e=this,n=this.json,i=this.json.accessors[t];if(i.bufferView===void 0&&i.sparse===void 0){const a=wc[i.type],o=Ns[i.componentType],l=i.normalized===!0,c=new o(i.count*a);return Promise.resolve(new Pe(c,a,l))}const s=[];return i.bufferView!==void 0?s.push(this.getDependency("bufferView",i.bufferView)):s.push(null),i.sparse!==void 0&&(s.push(this.getDependency("bufferView",i.sparse.indices.bufferView)),s.push(this.getDependency("bufferView",i.sparse.values.bufferView))),Promise.all(s).then(function(a){const o=a[0],l=wc[i.type],c=Ns[i.componentType],h=c.BYTES_PER_ELEMENT,d=h*l,u=i.byteOffset||0,f=i.bufferView!==void 0?n.bufferViews[i.bufferView].byteStride:void 0,m=i.normalized===!0;let _,p;if(f&&f!==d){const g=Math.floor(u/f),v="InterleavedBuffer:"+i.bufferView+":"+i.componentType+":"+g+":"+i.count;let M=e.cache.get(v);M||(_=new c(o,g*f,i.count*f/h),M=new Bh(_,f/h),e.cache.add(v,M)),p=new ur(M,l,u%f/h,m)}else o===null?_=new c(i.count*l):_=new c(o,u,i.count*l),p=new Pe(_,l,m);if(i.sparse!==void 0){const g=wc.SCALAR,v=Ns[i.sparse.indices.componentType],M=i.sparse.indices.byteOffset||0,x=i.sparse.values.byteOffset||0,b=new v(a[1],M,i.sparse.count*g),S=new c(a[2],x,i.sparse.count*l);o!==null&&(p=new Pe(p.array.slice(),p.itemSize,p.normalized)),p.normalized=!1;for(let T=0,y=b.length;T<y;T++){const A=b[T];if(p.setX(A,S[T*l]),l>=2&&p.setY(A,S[T*l+1]),l>=3&&p.setZ(A,S[T*l+2]),l>=4&&p.setW(A,S[T*l+3]),l>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}p.normalized=m}return p})}loadTexture(t){const e=this.json,n=this.options,s=e.textures[t].source,a=e.images[s];let o=this.textureLoader;if(a.uri){const l=n.manager.getHandler(a.uri);l!==null&&(o=l)}return this.loadTextureImage(t,s,o)}loadTextureImage(t,e,n){const i=this,s=this.json,a=s.textures[t],o=s.images[e],l=(o.uri||o.bufferView)+":"+a.sampler;if(this.textureCache[l])return this.textureCache[l];const c=this.loadImageSource(e,n).then(function(h){h.flipY=!1,h.name=a.name||o.name||"",h.name===""&&typeof o.uri=="string"&&o.uri.startsWith("data:image/")===!1&&(h.name=o.uri);const u=(s.samplers||{})[a.sampler]||{};return h.magFilter=kf[u.magFilter]||Ne,h.minFilter=kf[u.minFilter]||oi,h.wrapS=Vf[u.wrapS]||hn,h.wrapT=Vf[u.wrapT]||hn,h.generateMipmaps=!h.isCompressedTexture&&h.minFilter!==Ue&&h.minFilter!==Ne,i.associations.set(h,{textures:t}),h}).catch(function(){return null});return this.textureCache[l]=c,c}loadImageSource(t,e){const n=this,i=this.json,s=this.options;if(this.sourceCache[t]!==void 0)return this.sourceCache[t].then(d=>d.clone());const a=i.images[t],o=self.URL||self.webkitURL;let l=a.uri||"",c=!1;if(a.bufferView!==void 0)l=n.getDependency("bufferView",a.bufferView).then(function(d){c=!0;const u=new Blob([d],{type:a.mimeType});return l=o.createObjectURL(u),l});else if(a.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+t+" is missing URI and bufferView");const h=Promise.resolve(l).then(function(d){return new Promise(function(u,f){let m=u;e.isImageBitmapLoader===!0&&(m=function(_){const p=new Re(_);p.needsUpdate=!0,u(p)}),e.load(Ur.resolveURL(d,s.path),m,void 0,f)})}).then(function(d){return c===!0&&o.revokeObjectURL(l),ii(d,a),d.userData.mimeType=a.mimeType||QM(a.uri),d}).catch(function(d){throw console.error("THREE.GLTFLoader: Couldn't load texture",l),d});return this.sourceCache[t]=h,h}assignTexture(t,e,n,i){const s=this;return this.getDependency("texture",n.index).then(function(a){if(!a)return null;if(n.texCoord!==void 0&&n.texCoord>0&&(a=a.clone(),a.channel=n.texCoord),s.extensions[te.KHR_TEXTURE_TRANSFORM]){const o=n.extensions!==void 0?n.extensions[te.KHR_TEXTURE_TRANSFORM]:void 0;if(o){const l=s.associations.get(a);a=s.extensions[te.KHR_TEXTURE_TRANSFORM].extendTexture(a,o),s.associations.set(a,l)}}return i!==void 0&&(a.colorSpace=i),t[e]=a,a})}assignFinalMaterial(t){const e=t.geometry;let n=t.material;const i=e.attributes.tangent===void 0,s=e.attributes.color!==void 0,a=e.attributes.normal===void 0;if(t.isPoints){const o="PointsMaterial:"+n.uuid;let l=this.cache.get(o);l||(l=new au,Mn.prototype.copy.call(l,n),l.color.copy(n.color),l.map=n.map,l.sizeAttenuation=!1,this.cache.add(o,l)),n=l}else if(t.isLine){const o="LineBasicMaterial:"+n.uuid;let l=this.cache.get(o);l||(l=new eu,Mn.prototype.copy.call(l,n),l.color.copy(n.color),l.map=n.map,this.cache.add(o,l)),n=l}if(i||s||a){let o="ClonedMaterial:"+n.uuid+":";i&&(o+="derivative-tangents:"),s&&(o+="vertex-colors:"),a&&(o+="flat-shading:");let l=this.cache.get(o);l||(l=n.clone(),s&&(l.vertexColors=!0),a&&(l.flatShading=!0),i&&(l.normalScale&&(l.normalScale.y*=-1),l.clearcoatNormalScale&&(l.clearcoatNormalScale.y*=-1)),this.cache.add(o,l),this.associations.set(l,this.associations.get(n))),n=l}t.material=n}getMaterialType(){return sc}loadMaterial(t){const e=this,n=this.json,i=this.extensions,s=n.materials[t];let a;const o={},l=s.extensions||{},c=[];if(l[te.KHR_MATERIALS_UNLIT]){const d=i[te.KHR_MATERIALS_UNLIT];a=d.getMaterialType(),c.push(d.extendParams(o,s,e))}else{const d=s.pbrMetallicRoughness||{};if(o.color=new pt(1,1,1),o.opacity=1,Array.isArray(d.baseColorFactor)){const u=d.baseColorFactor;o.color.setRGB(u[0],u[1],u[2],xn),o.opacity=u[3]}d.baseColorTexture!==void 0&&c.push(e.assignTexture(o,"map",d.baseColorTexture,Fe)),o.metalness=d.metallicFactor!==void 0?d.metallicFactor:1,o.roughness=d.roughnessFactor!==void 0?d.roughnessFactor:1,d.metallicRoughnessTexture!==void 0&&(c.push(e.assignTexture(o,"metalnessMap",d.metallicRoughnessTexture)),c.push(e.assignTexture(o,"roughnessMap",d.metallicRoughnessTexture))),a=this._invokeOne(function(u){return u.getMaterialType&&u.getMaterialType(t)}),c.push(Promise.all(this._invokeAll(function(u){return u.extendMaterialParams&&u.extendMaterialParams(t,o)})))}s.doubleSided===!0&&(o.side=qe);const h=s.alphaMode||Tc.OPAQUE;if(h===Tc.BLEND?(o.transparent=!0,o.depthWrite=!1):(o.transparent=!1,h===Tc.MASK&&(o.alphaTest=s.alphaCutoff!==void 0?s.alphaCutoff:.5)),s.normalTexture!==void 0&&a!==Te&&(c.push(e.assignTexture(o,"normalMap",s.normalTexture)),o.normalScale=new ft(1,1),s.normalTexture.scale!==void 0)){const d=s.normalTexture.scale;o.normalScale.set(d,d)}if(s.occlusionTexture!==void 0&&a!==Te&&(c.push(e.assignTexture(o,"aoMap",s.occlusionTexture)),s.occlusionTexture.strength!==void 0&&(o.aoMapIntensity=s.occlusionTexture.strength)),s.emissiveFactor!==void 0&&a!==Te){const d=s.emissiveFactor;o.emissive=new pt().setRGB(d[0],d[1],d[2],xn)}return s.emissiveTexture!==void 0&&a!==Te&&c.push(e.assignTexture(o,"emissiveMap",s.emissiveTexture,Fe)),Promise.all(c).then(function(){const d=new a(o);return s.name&&(d.name=s.name),ii(d,s),e.associations.set(d,{materials:t}),s.extensions&&qi(i,d,s),d})}createUniqueName(t){const e=ge.sanitizeNodeName(t||"");return e in this.nodeNamesUsed?e+"_"+ ++this.nodeNamesUsed[e]:(this.nodeNamesUsed[e]=0,e)}loadGeometries(t){const e=this,n=this.extensions,i=this.primitiveCache;function s(o){return n[te.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(o,e).then(function(l){return Hf(l,o,e)})}const a=[];for(let o=0,l=t.length;o<l;o++){const c=t[o],h=jM(c),d=i[h];if(d)a.push(d.promise);else{let u;c.extensions&&c.extensions[te.KHR_DRACO_MESH_COMPRESSION]?u=s(c):u=Hf(new ve,c,e),c.mode===Pn.TRIANGLE_STRIP?u=u.then(f=>Uf(f,vh)):c.mode===Pn.TRIANGLE_FAN&&(u=u.then(f=>Uf(f,hl))),i[h]={primitive:c,promise:u},a.push(u)}}return Promise.all(a)}loadMesh(t){const e=this,n=this.json,i=this.extensions,s=n.meshes[t],a=s.primitives,o=[];for(let l=0,c=a.length;l<c;l++){const h=a[l].material===void 0?$M(this.cache):this.getDependency("material",a[l].material);o.push(h)}return o.push(e.loadGeometries(a)),Promise.all(o).then(async function(l){const c=l.slice(0,l.length-1),h=l[l.length-1],d=[];for(let f=0,m=h.length;f<m;f++){const _=h[f],p=a[f];let g;const v=c[f];if(p.mode===Pn.TRIANGLES||p.mode===Pn.TRIANGLE_STRIP||p.mode===Pn.TRIANGLE_FAN||p.mode===void 0){const M=s.isSkinnedMesh===!0,x=_.hasAttribute("skinIndex")&&_.hasAttribute("skinWeight");M&&x===!1&&console.warn("THREE.GLTFLoader: Missing skinIndex or skinWeight attributes. Skinning disabled."),g=M&&x?new Bp(_,v):new Xt(_,v),g.isSkinnedMesh===!0&&g.normalizeSkinWeights()}else if(p.mode===Pn.LINES)g=new Gp(_,v);else if(p.mode===Pn.LINE_STRIP)g=new Gl(_,v);else if(p.mode===Pn.LINE_LOOP)g=new Wp(_,v);else if(p.mode===Pn.POINTS)g=new lu(_,v);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+p.mode);Object.keys(g.geometry.morphAttributes).length>0&&JM(g,s),g.name=e.createUniqueName(s.name||"mesh_"+t),ii(g,s),p.extensions&&qi(i,g,p),e.assignFinalMaterial(g),d.push(g)}for(let f=0,m=d.length;f<m;f++)e.associations.set(d[f],{meshes:t,primitives:f});if(d.length===1)return s.extensions&&qi(i,d[0],s),d[0];const u=new ze;s.extensions&&qi(i,u,s),e.associations.set(u,{meshes:t});for(let f=0,m=d.length;f<m;f++)u.add(d[f]);return u})}loadCamera(t){let e;const n=this.json.cameras[t],i=n[n.type];if(!i){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}return n.type==="perspective"?e=new on(sa.radToDeg(i.yfov),i.aspectRatio||1,i.znear||1,i.zfar||2e6):n.type==="orthographic"&&(e=new Dr(-i.xmag,i.xmag,i.ymag,-i.ymag,i.znear,i.zfar)),n.name&&(e.name=this.createUniqueName(n.name)),ii(e,n),Promise.resolve(e)}loadSkin(t){const e=this.json.skins[t],n=[];for(let i=0,s=e.joints.length;i<s;i++)n.push(this._loadNodeShallow(e.joints[i]));return e.inverseBindMatrices!==void 0?n.push(this.getDependency("accessor",e.inverseBindMatrices)):n.push(null),Promise.all(n).then(function(i){const s=i.pop(),a=i,o=[],l=[];for(let c=0,h=a.length;c<h;c++){const d=a[c];if(d){o.push(d);const u=new It;s!==null&&u.fromArray(s.array,c*16),l.push(u)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',e.joints[c])}return new kl(o,l)})}loadAnimation(t){const e=this.json,n=this,i=e.animations[t],s=i.name?i.name:"animation_"+t,a=[],o=[],l=[],c=[],h=[];for(let d=0,u=i.channels.length;d<u;d++){const f=i.channels[d],m=i.samplers[f.sampler],_=f.target,p=_.node,g=i.parameters!==void 0?i.parameters[m.input]:m.input,v=i.parameters!==void 0?i.parameters[m.output]:m.output;_.node!==void 0&&(a.push(this.getDependency("node",p)),o.push(this.getDependency("accessor",g)),l.push(this.getDependency("accessor",v)),c.push(m),h.push(_))}return Promise.all([Promise.all(a),Promise.all(o),Promise.all(l),Promise.all(c),Promise.all(h)]).then(function(d){const u=d[0],f=d[1],m=d[2],_=d[3],p=d[4],g=[];for(let M=0,x=u.length;M<x;M++){const b=u[M],S=f[M],T=m[M],y=_[M],A=p[M];if(b===void 0)continue;b.updateMatrix&&b.updateMatrix();const E=n._createAnimationTracks(b,S,T,y,A);if(E)for(let P=0;P<E.length;P++)g.push(E[P])}const v=new zm(s,void 0,g);return ii(v,i),v})}createNodeMesh(t){const e=this.json,n=this,i=e.nodes[t];return i.mesh===void 0?null:n.getDependency("mesh",i.mesh).then(function(s){const a=n._getNodeRef(n.meshCache,i.mesh,s);return i.weights!==void 0&&a.traverse(function(o){if(o.isMesh)for(let l=0,c=i.weights.length;l<c;l++)o.morphTargetInfluences[l]=i.weights[l]}),a})}loadNode(t){const e=this.json,n=this,i=e.nodes[t],s=n._loadNodeShallow(t),a=[],o=i.children||[];for(let c=0,h=o.length;c<h;c++)a.push(n.getDependency("node",o[c]));const l=i.skin===void 0?Promise.resolve(null):n.getDependency("skin",i.skin);return Promise.all([s,Promise.all(a),l]).then(function(c){const h=c[0],d=c[1],u=c[2];u!==null&&h.traverse(function(f){f.isSkinnedMesh&&f.bind(u,ty)});for(let f=0,m=d.length;f<m;f++)h.add(d[f]);if(h.userData.pivot!==void 0&&d.length>0){const f=h.userData.pivot,m=d[0];h.pivot=new L().fromArray(f),h.position.x-=f[0],h.position.y-=f[1],h.position.z-=f[2],m.position.set(0,0,0),delete h.userData.pivot}return h})}_loadNodeShallow(t){const e=this.json,n=this.extensions,i=this;if(this.nodeCache[t]!==void 0)return this.nodeCache[t];const s=e.nodes[t],a=s.name?i.createUniqueName(s.name):"",o=[],l=i._invokeOne(function(c){return c.createNodeMesh&&c.createNodeMesh(t)});return l&&o.push(l),s.camera!==void 0&&o.push(i.getDependency("camera",s.camera).then(function(c){return i._getNodeRef(i.cameraCache,s.camera,c)})),i._invokeAll(function(c){return c.createNodeAttachment&&c.createNodeAttachment(t)}).forEach(function(c){o.push(c)}),this.nodeCache[t]=Promise.all(o).then(function(c){let h;if(s.isBone===!0?h=new Jh:c.length>1?h=new ze:c.length===1?h=c[0]:h=new Ae,h!==c[0])for(let d=0,u=c.length;d<u;d++)h.add(c[d]);if(s.name&&(h.userData.name=s.name,h.name=a),ii(h,s),s.extensions&&qi(n,h,s),s.matrix!==void 0){const d=new It;d.fromArray(s.matrix),h.applyMatrix4(d)}else s.translation!==void 0&&h.position.fromArray(s.translation),s.rotation!==void 0&&h.quaternion.fromArray(s.rotation),s.scale!==void 0&&h.scale.fromArray(s.scale);if(!i.associations.has(h))i.associations.set(h,{});else if(s.mesh!==void 0&&i.meshCache.refs[s.mesh]>1){const d=i.associations.get(h);i.associations.set(h,{...d})}return i.associations.get(h).nodes=t,h}),this.nodeCache[t]}loadScene(t){const e=this.extensions,n=this.json.scenes[t],i=this,s=new ze;n.name&&(s.name=i.createUniqueName(n.name)),ii(s,n),n.extensions&&qi(e,s,n);const a=n.nodes||[],o=[];for(let l=0,c=a.length;l<c;l++)o.push(i.getDependency("node",a[l]));return Promise.all(o).then(function(l){for(let h=0,d=l.length;h<d;h++){const u=l[h];u.parent!==null?s.add(SM(u)):s.add(u)}const c=h=>{const d=new Map;for(const[u,f]of i.associations)(u instanceof Mn||u instanceof Re)&&d.set(u,f);return h.traverse(u=>{const f=i.associations.get(u);f!=null&&d.set(u,f)}),d};return i.associations=c(s),s})}_createAnimationTracks(t,e,n,i,s){const a=[],o=t.name?t.name:t.uuid,l=[];function c(f){f.morphTargetInfluences&&l.push(f.name?f.name:f.uuid)}Pi[s.path]===Pi.weights?(c(t),t.isGroup&&t.children.forEach(c)):l.push(o);let h;switch(Pi[s.path]){case Pi.weights:h=Ir;break;case Pi.rotation:h=Lr;break;case Pi.translation:case Pi.scale:h=Oa;break;default:switch(n.itemSize){case 1:h=Ir;break;case 2:case 3:default:h=Oa;break}break}const d=i.interpolation!==void 0?ZM[i.interpolation]:tr,u=this._getArrayFromAccessor(n);for(let f=0,m=l.length;f<m;f++){const _=new h(l[f]+"."+Pi[s.path],e.array,u,d);i.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(_),a.push(_)}return a}_getArrayFromAccessor(t){let e=t.array;if(t.normalized){const n=Cc(e.constructor),i=new Float32Array(e.length);for(let s=0,a=e.length;s<a;s++)i[s]=e[s]*n;e=i}return e}_createCubicSplineTrackInterpolant(t){t.createInterpolant=function(n){const i=this instanceof Lr?qM:Bf;return new i(this.times,this.values,this.getValueSize()/3,n)},t.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}}function ny(r,t,e){const n=t.attributes,i=new pi;if(n.POSITION!==void 0){const o=e.json.accessors[n.POSITION],l=o.min,c=o.max;if(l!==void 0&&c!==void 0){if(i.set(new L(l[0],l[1],l[2]),new L(c[0],c[1],c[2])),o.normalized){const h=Cc(Ns[o.componentType]);i.min.multiplyScalar(h),i.max.multiplyScalar(h)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;const s=t.targets;if(s!==void 0){const o=new L,l=new L;for(let c=0,h=s.length;c<h;c++){const d=s[c];if(d.POSITION!==void 0){const u=e.json.accessors[d.POSITION],f=u.min,m=u.max;if(f!==void 0&&m!==void 0){if(l.setX(Math.max(Math.abs(f[0]),Math.abs(m[0]))),l.setY(Math.max(Math.abs(f[1]),Math.abs(m[1]))),l.setZ(Math.max(Math.abs(f[2]),Math.abs(m[2]))),u.normalized){const _=Cc(Ns[u.componentType]);l.multiplyScalar(_)}o.max(l)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}i.expandByVector(o)}r.boundingBox=i;const a=new $n;i.getCenter(a.center),a.radius=i.min.distanceTo(i.max)/2,r.boundingSphere=a}function Hf(r,t,e){const n=t.attributes,i=[];function s(a,o){return e.getDependency("accessor",a).then(function(l){r.setAttribute(o,l)})}for(const a in n){const o=Ac[a]||a.toLowerCase();o in r.attributes||i.push(s(n[a],o))}if(t.indices!==void 0&&!r.index){const a=e.getDependency("accessor",t.indices).then(function(o){r.setIndex(o)});i.push(a)}return Qt.workingColorSpace!==xn&&"COLOR_0"in n&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${Qt.workingColorSpace}" not supported.`),ii(r,t),ny(r,t,e),Promise.all(i).then(function(){return t.targets!==void 0?KM(r,t.targets,e):r})}var iy=""+new URL("tree_palm-BEEAKdDk.glb",self.location.href).href,sy=""+new URL("tree_palmBend-CQDkKgc9.glb",self.location.href).href,ry=""+new URL("tree_palmTall-BKlEnhoO.glb",self.location.href).href,ay=""+new URL("tree_palmDetailedShort-DaC7NTEp.glb",self.location.href).href,oy=""+new URL("plant_bushLarge-BLvTfwBP.glb",self.location.href).href,ly=""+new URL("tree_oak-DRiJ_qxq.glb",self.location.href).href,cy=""+new URL("tree_default-BVPrFQ50.glb",self.location.href).href,hy=""+new URL("tree_detailed-Bj1KgEOz.glb",self.location.href).href,uy=""+new URL("tree_fat-t81E4Z9b.glb",self.location.href).href,Rc=""+new URL("plant_bush-OKb8oW2E.glb",self.location.href).href,Gf=""+new URL("tree_pineRoundA-Ci4Gf58C.glb",self.location.href).href,fy=""+new URL("tree_pineTallA_detailed-Dwup5pQY.glb",self.location.href).href,dy=""+new URL("tree_pineDefaultA-o9UUWThz.glb",self.location.href).href,py=""+new URL("tree_cone_dark-C35861im.glb",self.location.href).href,my=""+new URL("tree_plateau-DVzdsNJV.glb",self.location.href).href,gy=""+new URL("tree_thin-DVItm2Xl.glb",self.location.href).href,xy="data:model/gltf-binary;base64,Z2xURgIAAAB0DwAAsAUAAEpTT057ImV4dGVuc2lvbnNVc2VkIjpbIktIUl9tYXRlcmlhbHNfdW5saXQiXSwiYXNzZXQiOnsiZ2VuZXJhdG9yIjoiVW5pR0xURi0xLjI3IiwidmVyc2lvbiI6IjIuMCJ9LCJidWZmZXJzIjpbeyJieXRlTGVuZ3RoIjoyNDcyfV0sImJ1ZmZlclZpZXdzIjpbeyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjAsImJ5dGVMZW5ndGgiOjc5MiwidGFyZ2V0IjozNDk2Mn0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjc5MiwiYnl0ZUxlbmd0aCI6NzkyLCJ0YXJnZXQiOjM0OTYyfSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MTU4NCwiYnl0ZUxlbmd0aCI6NTI4LCJ0YXJnZXQiOjM0OTYyfSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MjExMiwiYnl0ZUxlbmd0aCI6MzYwLCJ0YXJnZXQiOjM0OTYzfV0sImFjY2Vzc29ycyI6W3siYnVmZmVyVmlldyI6MCwiYnl0ZU9mZnNldCI6MCwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6NjYsIm1heCI6WzAuMTI1NjQ0NywwLjI5NTUzNjk2NSwwLjIwNjc5NjFdLCJtaW4iOlstMC4yMzg3ODc1NDcsMCwtMC4yMDY3OTYxXSwibm9ybWFsaXplZCI6ZmFsc2V9LHsiYnVmZmVyVmlldyI6MSwiYnl0ZU9mZnNldCI6MCwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6NjYsIm5vcm1hbGl6ZWQiOmZhbHNlfSx7ImJ1ZmZlclZpZXciOjIsImJ5dGVPZmZzZXQiOjAsInR5cGUiOiJWRUMyIiwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjY2LCJub3JtYWxpemVkIjpmYWxzZX0seyJidWZmZXJWaWV3IjozLCJieXRlT2Zmc2V0IjowLCJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyNSwiY291bnQiOjkwLCJub3JtYWxpemVkIjpmYWxzZX1dLCJtYXRlcmlhbHMiOlt7Im5hbWUiOiJncmFzcyIsInBick1ldGFsbGljUm91Z2huZXNzIjp7ImJhc2VDb2xvckZhY3RvciI6WzAuMTcyNTQ5MDI0LDAuODQ3MDU4ODMzLDAuNzIxNTY4NjQ0LDFdLCJtZXRhbGxpY0ZhY3RvciI6MSwicm91Z2huZXNzRmFjdG9yIjoxfSwiZG91YmxlU2lkZWQiOmZhbHNlLCJhbHBoYU1vZGUiOiJPUEFRVUUifV0sIm1lc2hlcyI6W3sibmFtZSI6Ik1lc2ggcGxhbnRfYnVzaFRyaWFuZ2xlIiwicHJpbWl0aXZlcyI6W3sibW9kZSI6NCwiaW5kaWNlcyI6MywiYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MCwiTk9STUFMIjoxLCJURVhDT09SRF8wIjoyfSwibWF0ZXJpYWwiOjB9XX1dLCJub2RlcyI6W3siY2hpbGRyZW4iOlsxXSwibmFtZSI6InRtcFBhcmVudCIsInRyYW5zbGF0aW9uIjpbMCwwLDBdLCJyb3RhdGlvbiI6WzAsMCwwLDFdLCJzY2FsZSI6WzEsMSwxXX0seyJuYW1lIjoicGxhbnRfYnVzaFRyaWFuZ2xlIiwidHJhbnNsYXRpb24iOlswLC0wLjA1LDBdLCJyb3RhdGlvbiI6WzAsMCwwLDFdLCJzY2FsZSI6WzEsMSwxXSwibWVzaCI6MH1dLCJzY2VuZXMiOlt7Im5vZGVzIjpbMV19XSwic2NlbmUiOjB9qAkAAEJJTgBq6TW9DK7FPUHAzD0qzN49DK7FPdfXPDz/9HA8S7ATPj5CHT4BqQA+S7ATPtdXtz3/9HA8S7ATPj5CHT4qzN49DK7FPdfXPDxq6TW9DK7FPUHAzD0BqQA+S7ATPtdXtz3DRMS7AAAAAOJnBD393f08AAAAACbTMzxq6TW9DK7FPUHAzD0qzN49DK7FPdfXPDxq6TW9DK7FPUHAzD393f08AAAAACbTMzzDRMS7AAAAAOJnBD0qzN49DK7FPdfXPDy5hPQ9rZo4PlvCUz7/9HA8S7ATPj5CHT4BqQA+S7ATPtdXtz0BqQA+S7ATPtdXtz3/9HA8S7ATPj5CHT65hPQ9rZo4PlvCUz5114O9XggiPkYltT1114O9XggiPkYltb3NzMy8AAAAADLmrjzNzMy8AAAAADLmrrzNzMy8AAAAADLmrjx114O9XggiPkYltb1114O9XggiPkYltT3NzMy8AAAAADLmrrxRuA++zhxyPqUsgz25hHS+n1CXPueMCKpRuA++zhxyPqUsg71RuA++zhxyPqUsg725hHS+n1CXPueMCKpRuA++zhxyPqUsgz1114O9XggiPkYltT1RuA++zhxyPqUsgz1114O9XggiPkYltb1RuA++zhxyPqUsg71114O9XggiPkYltb1RuA++zhxyPqUsgz1114O9XggiPkYltT1RuA++zhxyPqUsg73/9HA8agE4Pj5CHb65hPQ9qv9lPlvCU74BqQA+agE4PtdXt70BqQA+agE4PtdXt725hPQ9qv9lPlvCU77/9HA8agE4Pj5CHb5q6TW9KUr2PUHAzL3/9HA8agE4Pj5CHb4qzN49KUr2PdfXPLwBqQA+agE4PtdXt70qzN49KUr2PdfXPLz/9HA8agE4Pj5CHb5q6TW9KUr2PUHAzL0BqQA+agE4PtdXt7393f08AAAAACbTM7zDRMS7AAAAAOJnBL0qzN49KUr2PdfXPLxq6TW9KUr2PUHAzL0qzN49KUr2PdfXPLzDRMS7AAAAAOJnBL393f08AAAAACbTM7xq6TW9KUr2PUHAzL34IIi+aM5YPzDI6774IIi+aM5YPzDI6774IIi+aM5YPzDI6774IIi+aM5YPzDI6774IIg+aM5YvzDI6z74IIg+aM5YvzDI6z74IIg+aM5YvzDI6z74IIg+aM5YvzDI6z4UCe2+imTBPltHTb8UCe2+imTBPltHTb8UCe2+imTBPltHTb8UCe2+imTBPltHTb8UCe0+imTBvltHTT8UCe0+imTBvltHTT8UCe0+imTBvltHTT8UCe0+imTBvltHTT/qEjC+2WJwPwZ8mL7qEjC+2WJwPwZ8mL7qEjC+2WJwPwZ8mL7qEjA+2WJwvwZ8mD7qEjA+2WJwvwZ8mD7qEjA+2WJwvwZ8mD6GbHg/YUZ3PgAAAICGbHg/YUZ3PgAAAICGbHg/YUZ3PgAAAICGbHg/YUZ3PgAAAICGbHi/YUZ3vgAAAICGbHi/YUZ3vgAAAICGbHi/YUZ3vgAAAICGbHi/YUZ3vgAAAICqxQM/QHtbPwAAAICqxQM/QHtbPwAAAICqxQM/QHtbPwAAAICqxQO/QHtbvwAAAICqxQO/QHtbvwAAAICqxQO/QHtbvwAAAIB4nTc/wmIyPwAAAIB4nTc/wmIyPwAAAIB4nTc/wmIyPwAAAIB4nTc/wmIyPwAAAIB4nTe/wmIyvwAAAIB4nTe/wmIyvwAAAIB4nTe/wmIyvwAAAIB4nTe/wmIyvwAAAIArilS+kuZoP5UQuD4rilS+kuZoP5UQuD4rilS+kuZoP5UQuD4rilQ+kuZov5UQuL4rilQ+kuZov5UQuL4rilQ+kuZov5UQuL7Uu52+LqJJP/aZCD/Uu52+LqJJP/aZCD/Uu52+LqJJP/aZCD/Uu52+LqJJP/aZCD/Uu50+LqJJv/aZCL/Uu50+LqJJv/aZCL/Uu50+LqJJv/aZCL/Uu50+LqJJv/aZCL9nSvO+wVGfPiWyUj9nSvO+wVGfPiWyUj9nSvO+wVGfPiWyUj9nSvO+wVGfPiWyUj9nSvM+wVGfviWyUr9nSvM+wVGfviWyUr9nSvM+wVGfviWyUr9nSvM+wVGfviWyUr+83V5AHLNKwLzdXsAcs0rAxWIhQPNe1sDFYiHA817WwMViIUDzXtbAvN1ewByzSsC83V5AHLNKwMViIcDzXtbAXS5XP5DTID9dLle/kNMgP7zdXkDYdV7AvN1ewNh1XsC83V5A2HVewF0uV7+Q0yA/XS5XP5DTID+83V7A2HVewABQqSzISyTBxWIhQOmFxMDFYiHA6YXEwMViIcDphcTAxWIhQOmFxMAAUKksyEskwbzdXsBSCbXAvN1eQFIJtcBdLle/oSdDP10uVz+hJ0M/XS5Xv6EnQz+83V5AUgm1wLzdXsBSCbXAXS5XP6EnQz/FYiHAPXYIwTn+pywuyVDBxWIhQD12CMHFYiFAPXYIwTn+pywuyVDBxWIhwD12CMG83V7Al3+nwMViIcBQbhjBvN1eQJd/p8DFYiFAUG4YwbzdXkCXf6fAxWIhwFBuGMG83V7Al3+nwMViIUBQbhjBxWIhwJHX3sAA8K4s8JMzwcViIUCR197AxWIhQJHX3sAA8K4s8JMzwcViIcCR197AvN1ewNJ1esDFYiHAhMH2wLzdXkDSdXrAxWIhQITB9sC83V5A0nV6wMViIcCEwfbAvN1ewNJ1esDFYiFAhMH2wF0uVz9GmDE/XS5Xv0aYMT+83V5A4ziJwLzdXsDjOInAvN1eQOM4icBdLle/RpgxP10uVz9GmDE/vN1ewOM4icACAAAAAQAAAAAAAAABAAAAAgAAAAMAAAAGAAAABQAAAAQAAAAHAAAABAAAAAUAAAAKAAAACQAAAAgAAAAJAAAACgAAAAsAAAAOAAAADQAAAAwAAAAPAAAADAAAAA0AAAASAAAAEQAAABAAAAAVAAAAFAAAABMAAAAYAAAAFwAAABYAAAAXAAAAGAAAABkAAAAcAAAAGwAAABoAAAAdAAAAGgAAABsAAAAgAAAAHwAAAB4AAAAjAAAAIgAAACEAAAAmAAAAJQAAACQAAAAlAAAAJgAAACcAAAAqAAAAKQAAACgAAAArAAAAKAAAACkAAAAuAAAALQAAACwAAAAxAAAAMAAAAC8AAAA0AAAAMwAAADIAAAAzAAAANAAAADUAAAA4AAAANwAAADYAAAA5AAAANgAAADcAAAA8AAAAOwAAADoAAAA7AAAAPAAAAD0AAABAAAAAPwAAAD4AAABBAAAAPgAAAD8AAAA=",vy=""+new URL("tree_default_fall-C-WMBuBk.glb",self.location.href).href,_y=""+new URL("tree_simple_fall-EWa2Y1F6.glb",self.location.href).href,My=""+new URL("tree_tall-BEMahoC2.glb",self.location.href).href;const yy={tropical:[{url:iy,height:9,weight:3},{url:sy,height:8.5,weight:2},{url:ry,height:11,weight:2},{url:ay,height:6.5,weight:2},{url:oy,height:2.4,weight:2}],temperate:[{url:ly,height:8,weight:3},{url:cy,height:7,weight:3},{url:hy,height:8.5,weight:2},{url:uy,height:6,weight:2},{url:Rc,height:2.2,weight:2}],boreal:[{url:Gf,height:9,weight:3},{url:fy,height:12,weight:3},{url:dy,height:10,weight:2},{url:py,height:8,weight:2},{url:Rc,height:2,weight:1}],savanna:[{url:my,height:7.5,weight:4},{url:gy,height:8,weight:2},{url:xy,height:2.3,weight:3}],eastasian:[{url:vy,height:6.5,weight:3,tint:"#ffb7cf"},{url:_y,height:6,weight:2,tint:"#d9442e"},{url:My,height:8,weight:2},{url:Gf,height:7.5,weight:2},{url:Rc,height:2,weight:2}]},Wf=new Map;function Sy(r){const t=Wf.get(r);if(t)return t;const e=new bM().loadAsync(r).then(n=>{const i=[];if(n.scene.updateMatrixWorld(!0),n.scene.traverse(l=>{const c=l;if(!c.isMesh)return;const h=c.geometry.clone().applyMatrix4(c.matrixWorld),d=new ve;d.setAttribute("position",h.getAttribute("position")),h.getAttribute("normal")||h.computeVertexNormals(),d.setAttribute("normal",h.getAttribute("normal")),h.index&&d.setIndex(h.index);const u=new pt(c.material.color??"#6f9d63"),f=d.getAttribute("position").count,m=new Float32Array(f*3);for(let _=0;_<f;_+=1)m[_*3]=u.r,m[_*3+1]=u.g,m[_*3+2]=u.b;d.setAttribute("color",new Pe(m,3)),i.push(d.index?d.toNonIndexed():d),h.dispose()}),!i.length)return null;const s=bc(i);for(const l of i)l.dispose();if(!s)return null;s.computeBoundingBox();const a=s.boundingBox,o=Math.max(.001,a.max.y-a.min.y);return s.translate(-(a.min.x+a.max.x)/2,-a.min.y,-(a.min.z+a.max.z)/2),s.scale(1/o,1/o,1/o),s}).catch(n=>(console.warn("[city] flora model unavailable",r,n),null));return Wf.set(r,e),e}async function by(r){const t=yy[r],e=await Promise.all(t.map(n=>Sy(n.url)));return t.flatMap((n,i)=>e[i]?[{species:n,geometry:e[i]}]:[])}function Pc(r){const t=Math.min(1,Math.max(0,r));return t*t*t*(t*(t*6-15)+10)}const wy=52,Ic=[1.4,1.2,1,.85];function Ay(r,t,e,n={}){if(n.cut!=="short")return Lc(r,t,e,n,Math.PI*2);let i=Lc(r,t,e,n,Ic[0]);for(let s=1;s<Ic.length&&i.durationSec>wy;s+=1)i=Lc(r,t,e,n,Ic[s]);return i}function Lc(r,t,e,n,i){const{left:s,right:a,north:o,south:l}=r.urbanBounds,c=(s+a)/2,h=(o+l)/2,d=Math.max(a-s,l-o),u=(k,$)=>Math.max(0,r.terrain.height(k,$));let f={x:c,z:h,height:30,ground:u(c,h)};for(const k of e.values())k.height>f.height&&(f=k);const m=[],_=(k,$,X)=>m.push({pos:k,look:$,card:X}),p=r.core??{x:c,z:h},g=[...r.districts].map(k=>({layout:k,data:t.districts.find($=>$.id===k.id)})).filter(k=>k.data&&k.layout.slots.size>0).sort((k,$)=>$.data.tokensTotal-k.data.tokensTotal),v=k=>{const $=[...k.layout.slots.values()];return{x:$.reduce((X,nt)=>X+nt.x,0)/$.length,z:$.reduce((X,nt)=>X+nt.z,0)/$.length}},M=g.slice(0,4).map(k=>{const $=v(k);return{district:k,c:$,angle:Math.atan2($.z-p.z,$.x-p.x),distance:Math.hypot($.x-p.x,$.z-p.z)}}).sort((k,$)=>k.angle-$.angle),x=M.map(k=>k.district),b=Math.atan2(f.z-p.z,f.x-p.x),S=n.cut==="short"&&f.height>30,T=S?i:Math.PI*2,y=S?.4:1,A=S?b-.9:M.length?M[0].angle-.6:0,E=k=>{let $=k;for(;$<A;)$+=Math.PI*2;for(;$>=A+Math.PI*2;)$-=Math.PI*2;return $},P=M.map(k=>E(k.angle)),D=(k,$)=>Math.abs(Math.atan2(Math.sin(k-$),Math.cos(k-$))),N=Math.max(140,...M.map(k=>k.distance+60)),R=[];f.height>30&&R.push({angle:Math.atan2(f.z-p.z,f.x-p.x),radius:Math.hypot(f.x-p.x,f.z-p.z)+90,height:Math.max(40,f.height*.85),look:{x:f.x,y:f.ground+f.height*.6,z:f.z}});const B=[...r.bridges??[]].sort((k,$)=>$.length-k.length)[0];if(B){const k={x:(B.from.x+B.to.x)/2,z:(B.from.z+B.to.z)/2};R.push({angle:Math.atan2(k.z-p.z,k.x-p.x),radius:Math.hypot(k.x-p.x,k.z-p.z)+70,height:45,look:{x:k.x,y:6,z:k.z}})}const V=k=>{let $=0,X=0,nt={x:p.x,z:p.z},mt=0;M.forEach(W=>{const Q=Math.exp(-((D(k,W.angle)/.38)**2));$+=Q,X+=Q*(W.distance+60),Q>mt&&(mt=Q,nt=W.c)});const z=Math.min(1,$),O={radius:N*(1-z)+($>0?X/$:N)*z,height:120-58*z,look:{x:p.x+(nt.x-p.x)*mt,y:8,z:p.z+(nt.z-p.z)*mt}};for(const W of R){const Q=Math.exp(-((D(k,W.angle)/.3)**2));Q<.01||(O.radius+=(W.radius-O.radius)*Q,O.height+=(W.height-O.height)*Q,O.look={x:O.look.x+(W.look.x-O.look.x)*Q,y:O.look.y+(W.look.y-O.look.y)*Q,z:O.look.z+(W.look.z-O.look.z)*Q})}return O},Y=k=>{const $=V(k),X=p.x+Math.cos(k)*$.radius,nt=p.z+Math.sin(k)*$.radius;let mt=0;for(let O=0;O<12;O+=1){const W=O/12*Math.PI*2;mt+=u(X+Math.cos(W)*70,nt+Math.sin(W)*70)}const z=Math.max(u(X,nt),(mt/12+u(X,nt))/2);return{pos:[X,z+$.height,nt],look:[$.look.x,$.look.y,$.look.z]}},it={x:Math.cos(A),z:Math.sin(A)};_([p.x+it.x*(N+d*.75*y),d*.42,p.z+it.z*(N+d*.75*y)],[p.x,0,p.z]),_([p.x+it.x*(N+d*.3*y),d*.2,p.z+it.z*(N+d*.3*y)],[p.x,0,p.z]);const Z=Math.PI/10,j=new Map;P.forEach((k,$)=>{if(k-A>T)return;let X=Math.round((k-A)/Z);for(;j.has(X)&&X<Math.round(T/Z);)X+=1;j.set(X,$)});const ct=Math.round(T/Z);for(let k=0;k<=ct;k+=1){const $=Y(A+k*Z);_($.pos,$.look,j.get(k))}const xt=A+T,_t={x:Math.cos(xt+.3),z:Math.sin(xt+.3)};_([p.x+_t.x*(N+d*.35*y),d*.42,p.z+_t.z*(N+d*.35*y)],[p.x,0,p.z]),_([p.x+_t.x*(N+d*.7*y),d*.62,p.z+_t.z*(N+d*.7*y)],[p.x,10,p.z]);const kt=k=>{const[$,,X]=m[k-1].pos,[nt,,mt]=m[k].pos,[z,,O]=m[k+1].pos,W=nt-$,Q=mt-X,dt=z-nt,ht=O-mt,I=Math.hypot(W,Q),lt=Math.hypot(dt,ht);if(I*lt<1e-6)return{turn:Math.PI,din:{x:0,z:0},dout:{x:0,z:0}};const J={x:W/I,z:Q/I},gt={x:dt/lt,z:ht/lt};return{turn:Math.acos(Math.max(-1,Math.min(1,J.x*gt.x+J.z*gt.z))),din:J,dout:gt}},zt=115*Math.PI/180;for(let k=!0,$=0;k&&$<200;$+=1){k=!1;for(let X=1;X<m.length-1;X+=1){const{turn:nt,din:mt,dout:z}=kt(X);if(nt<=zt)continue;if(m[X].card===void 0||S){m.splice(X,1),k=!0;break}let O={x:mt.x-z.x,z:mt.z-z.z};const W=Math.hypot(O.x,O.z),Q=nt>150*Math.PI/180;O=Q||W<.3?{x:-mt.z,z:mt.x}:{x:O.x/W,z:O.z/W};for(let dt=0;dt<(Q?25:10)&&kt(X).turn>zt;dt+=1)m[X].pos[0]+=O.x*30,m[X].pos[2]+=O.z*30;if(!(kt(X).turn>zt)){k=!0;break}}}const Dt=new Ua(m.map(k=>new L(...k.pos)),!1,"centripetal",.5),st=new Ua(m.map(k=>new L(...k.look)),!1,"centripetal",.5),rt=1600;Dt.arcLengthDivisions=4e3;const Mt=Dt.getLength()||1,Lt=k=>{const $=Dt.getPointAt(Math.min(1,Math.max(0,k)));return Math.max(12,$.y-u($.x,$.z))},yt=Number(globalThis.__CITY_CINE_OMEGA__??(S?.62:.55)),Bt=9,_e=120,Gt=3,Vt=Mt/rt,Kt=new Float64Array(rt);for(let k=0;k<rt;k+=1)Kt[k]=Math.min(_e,Math.max(Bt,yt*Lt((k+.5)/rt)));const Ht=Math.max(2,Math.round(80/Vt));let ee=new Float64Array(rt);for(let k=0;k<rt;k+=1){let $=1/0;for(let X=Math.max(0,k-Ht);X<=Math.min(rt-1,k+Ht);X+=1)$=Math.min($,Kt[X]);ee[k]=$}for(let k=0;k<2;k+=1){const $=new Float64Array(rt);for(let X=0;X<rt;X+=1){let nt=0,mt=0;for(let z=Math.max(0,X-Ht);z<=Math.min(rt-1,X+Ht);z+=1)nt+=ee[z],mt+=1;$[X]=nt/mt}ee=$}const fe=(ee[0]+ee[rt-1])*.5*Gt,Le=k=>{const $=k*Vt,X=Mt-(k+1)*Vt,nt=Math.min(1,.12+.88*Pc($/fe),.12+.88*Pc(X/fe));return ee[k]*nt},jt=new Float64Array(rt+1);for(let k=0;k<rt;k+=1)jt[k+1]=jt[k]+Vt/Le(k);const se=jt[rt],H=k=>{if(k<=0)return 0;if(k>=se)return 1;let $=0,X=rt;for(;X-$>1;){const nt=$+X>>1;jt[nt]<=k?$=nt:X=nt}return($+(k-jt[$])/(jt[X]-jt[$]||1))/rt},Ce=Dt.getLengths(),Yt=k=>{const $=k/Math.max(1,m.length-1),nt=Ce[Math.round($*Dt.arcLengthDivisions)]/Mt*rt,mt=Math.min(rt-1,Math.floor(nt));return jt[mt]+(jt[mt+1]-jt[mt])*(nt-mt)},U=k=>{const $=Dt.getPoint(k);return Math.max(12,$.y-u($.x,$.z))},w=t.windowStartMs,q=t.windowEndMs,K=se*.7,ot=[{atSec:.6,untilSec:5.2,kind:"title",text:t.windowLabel,detail:`${t.stats.totalSessions}`}];return m.forEach((k,$)=>{if(k.card===void 0)return;const X=x[k.card],nt=Yt($);ot.push({atSec:nt-2,untilSec:nt+2.2,kind:"district",text:X.data.label,detail:`${X.data.sessionCount}`})}),ot.push({atSec:se-5,untilSec:se+60,kind:"finale",text:"",detail:""}),{durationSec:se,position:k=>Dt.getPointAt(H(k)),target:k=>st.getPoint(Dt.getUtoTmapping(H(k),0)),cursor:k=>w+(q-w)*Pc(k/K),cards:ot,keyTimes:m.map((k,$)=>({seconds:Yt($),altitude:U($/Math.max(1,m.length-1))}))}}const no="system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";function Ty(r,t){const e=r.untilSec-r.atSec;if(e<=0||t<r.atSec||t>r.untilSec)return 0;const n=(t-r.atSec)/Math.min(e,r.kind==="finale"?1.6:e);return r.kind==="finale"?Math.min(1,n):n<.18?n/.18:n>.78?Math.max(0,1-(n-.78)/.22):1}function Ey(r,t){const{width:e,height:n,seconds:i,durationSec:s}=t;if(t.letterbox>0){const d=Math.max(0,(n-e/t.letterbox)/2)*Math.min(1,i/1.1);r.fillStyle="#050507",r.fillRect(0,0,e,d),r.fillRect(0,n-d,e,d)}const a=t.cards.find(h=>i>=h.atSec&&i<=h.untilSec),o=a?t.describe(a):null;if(a&&o){const h=Ty(a,i);if(h>.001){const d=n/1080,u=a.kind==="title"||a.kind==="finale",f=u?e/2:e*.06;let m=u?n*.46:n*.74;r.save(),r.globalAlpha=h,r.textAlign=u?"center":"left",r.textBaseline="alphabetic",r.fillStyle="#fff",r.shadowColor="rgba(0,0,0,0.55)",r.shadowBlur=18*d,r.shadowOffsetY=2*d,o.eyebrow&&(r.font=`600 ${Math.round(14*d)}px ${no}`,r.globalAlpha=h*.78,r.fillText(o.eyebrow.toUpperCase().split("").join(" "),f,m),r.globalAlpha=h,m+=12*d);const _=Math.round((a.kind==="finale"?84:52)*d);r.font=`700 ${_}px ${no}`,m+=_,r.fillText(o.title,f,m),o.subtitle&&(r.font=`400 ${Math.round(19*d)}px ${no}`,r.globalAlpha=h*.9,m+=36*d,r.fillText(o.subtitle,f,m)),r.restore()}}r.save(),r.globalAlpha=.6*Math.min(1,i/1.5),r.fillStyle="#fff",r.shadowColor="rgba(0,0,0,0.5)",r.shadowBlur=8,r.textAlign="right",r.font=`600 ${Math.round(13*(n/1080))}px ${no}`;const l=t.letterbox>0?n-Math.max(0,(n-e/t.letterbox)/2)-18*(n/1080):n-24*(n/1080);r.fillText(t.watermark,e-28*(n/1080),l),r.restore();const c=Math.max(Math.min(1,1-i/.6),Math.min(1,1-(s-i)/.6));c>.001&&(r.fillStyle=`rgba(5,5,7,${Math.min(1,c)})`,r.fillRect(0,0,e,n))}const Xf=r=>{const t=[];for(let e=24;e>=0;e-=8){const n=r>>>e&255;(n!==0||t.length>0)&&t.push(n)}return t},Yf=r=>{const t=[1,0,0,0,0,0,0,0];let e=r;for(let n=7;n>=1;n-=1)t[n]=e%256,e=Math.floor(e/256);return t},Zi=r=>{let t=0;for(const i of r)t+=i.length;const e=new Uint8Array(t);let n=0;for(const i of r)e.set(i,n),n+=i.length;return e},si=(r,t)=>Zi([Xf(r),Yf(t.length),t]),Cy=r=>{const t=[];let e=r;do t.unshift(e%256),e=Math.floor(e/256);while(e>0);return t},fn=(r,t)=>si(r,Cy(t)),io=(r,t)=>si(r,Array.from(new TextEncoder().encode(t))),Ry=(r,t)=>{const e=new ArrayBuffer(8);return new DataView(e).setFloat64(0,t,!1),si(r,new Uint8Array(e))},Se={EBML:440786851,EBMLVersion:17030,EBMLReadVersion:17143,EBMLMaxIDLength:17138,EBMLMaxSizeLength:17139,DocType:17026,DocTypeVersion:17031,DocTypeReadVersion:17029,Segment:408125543,Info:357149030,TimecodeScale:2807729,Duration:17545,MuxingApp:19840,WritingApp:22337,Tracks:374648427,TrackEntry:174,TrackNumber:215,TrackUID:29637,TrackType:131,CodecID:134,Video:224,PixelWidth:176,PixelHeight:186,FlagLacing:156,Cluster:524531317,Timecode:231,SimpleBlock:163};class Py{constructor(t){F(this,"frames",[]);this.options=t}addChunk(t,e,n){this.frames.push({timestampMs:Math.round(t),keyFrame:e,data:n})}finish(t){const e=si(Se.EBML,Zi([fn(Se.EBMLVersion,1),fn(Se.EBMLReadVersion,1),fn(Se.EBMLMaxIDLength,4),fn(Se.EBMLMaxSizeLength,8),io(Se.DocType,"webm"),fn(Se.DocTypeVersion,4),fn(Se.DocTypeReadVersion,2)])),n=si(Se.Info,Zi([fn(Se.TimecodeScale,1e6),Ry(Se.Duration,t),io(Se.MuxingApp,"agent-vitals"),io(Se.WritingApp,"agent-vitals")])),i=si(Se.Tracks,si(Se.TrackEntry,Zi([fn(Se.TrackNumber,1),fn(Se.TrackUID,1),fn(Se.TrackType,1),fn(Se.FlagLacing,0),io(Se.CodecID,this.options.codec),si(Se.Video,Zi([fn(Se.PixelWidth,this.options.width),fn(Se.PixelHeight,this.options.height)]))]))),s=[];let a=null;const o=()=>{a&&(s.push(si(Se.Cluster,Zi([fn(Se.Timecode,a.start),...a.blocks]))),a=null)};for(const h of this.frames){(!a||h.keyFrame||h.timestampMs-a.start>3e4)&&(o(),a={start:h.timestampMs,blocks:[]});const d=h.timestampMs-a.start,u=[129,d>>8&255,d&255,h.keyFrame?128:0];a.blocks.push(si(Se.SimpleBlock,Zi([u,h.data])))}o();const l=[n,i,...s],c=l.reduce((h,d)=>h+d.length,0);return new Blob([e,new Uint8Array(Xf(Se.Segment)),new Uint8Array(Yf(c)),...l],{type:"video/webm"})}}function Ft(r){let t=2166136261;for(let e=0;e<r.length;e+=1)t^=r.charCodeAt(e),t=Math.imul(t,16777619);return(t>>>0)/4294967296}function Iy(r,t,e,n=0){if(t<r.startedAt)return 0;if(r.active&&e)return r.builtFraction;const i=(r.endedAt??r.startedAt)-r.startedAt;let s=i;if(n>0){const o=(.9+r.seed*.6)*n;s=Math.min(Math.max(i,o),3.5*n)}if(!Number.isFinite(s)||s<=0)return 1;if(r.aggregated&&n<=0)return t>=r.startedAt?1:0;const a=(t-r.startedAt)/s;return Math.min(1,Math.max(.04,a))}function so(r,t,e){let n=(e|0)^Math.imul(r|0,374761393)^Math.imul(t|0,668265263);return n=Math.imul(n^n>>>13,1274126177),((n^n>>>16)>>>0)/4294967296}function qf(r){return r*r*(3-2*r)}function Ly(r,t,e){const n=Math.floor(r),i=Math.floor(t),s=qf(r-n),a=qf(t-i),o=so(n,i,e),l=so(n+1,i,e),c=so(n,i+1,e),h=so(n+1,i+1,e);return o+(l-o)*s+(c-o)*a+(o-l-c+h)*s*a}function Fs(r,t,e,n=3){let i=0,s=.5,a=1,o=0;for(let l=0;l<n;l+=1)i+=(Ly(r*a,t*a,e+l*1013)-.5)*2*s,o+=s,s*=.5,a*=2.07;return i/o}function Dc(r,t,e){const n=Math.min(1,Math.max(0,(e-r)/(t-r||1e-6)));return n*n*(3-2*n)}function Br(r,t,e){const n=e.x-t.x,i=e.z-t.z,s=Math.max(0,Math.min(1,((r.x-t.x)*n+(r.z-t.z)*i)/(n*n+i*i||1)));return Math.hypot(r.x-t.x-n*s,r.z-t.z-i*s)}function Zf(r,t){let e=!1,n=1/0;for(let i=0,s=t.length-1;i<t.length;s=i++){const a=t[i],o=t[s];a.z>r.z!=o.z>r.z&&r.x<(o.x-a.x)*(r.z-a.z)/(o.z-a.z)+a.x&&(e=!e),n=Math.min(n,Br(r,a,o))}return e?n:-n}const Uc=r=>`${r.x}:${r.z}`;class Nc{constructor(t){F(this,"cell",60);F(this,"cells",new Map);for(const e of t)for(let n=1;n<e.length;n+=1)this.add(e[n-1],e[n])}add(t,e){const n=this.cell;for(let i=Math.floor(Math.min(t.x,e.x)/n);i<=Math.floor(Math.max(t.x,e.x)/n);i+=1)for(let s=Math.floor(Math.min(t.z,e.z)/n);s<=Math.floor(Math.max(t.z,e.z)/n);s+=1){const a=`${i}:${s}`,o=this.cells.get(a);o?o.push([t,e]):this.cells.set(a,[[t,e]])}}closerThan(t,e){const n=Math.floor(t.x/this.cell),i=Math.floor(t.z/this.cell);for(let s=-1;s<=1;s+=1)for(let a=-1;a<=1;a+=1){const o=this.cells.get(`${n+s}:${i+a}`);if(o){for(const[l,c]of o)if(Br(t,l,c)<e)return!0}}return!1}}function zs(r,t,e,n){const i=5.25+Math.hypot(t,e)/2+1;if(n instanceof Nc)return!n.closerThan(r,i);for(const s of n)for(let a=1;a<s.length;a+=1)if(Br(r,s[a-1],s[a])<i)return!1;return!0}const Fc=["tropical","temperate","boreal","savanna","eastasian"],$f=400,Dy=5;function Uy(r){return Math.max(1,Math.min(Dy,Math.ceil(r/$f)))}const Kf=r=>Math.ceil($f*r*1.35);function Ny(r,t=2){const e=o=>Ft(`${r}:${o}`),n={stretch:.78+e("stretch")*.5,spin:e("spin")*Math.PI*2,harmonics:[2,3,5].map(o=>({k:o,a:.05+e(`h${o}`)*(o===2?.16:.1),p:e(`hp${o}`)*Math.PI*2})),bays:Array.from({length:1+Math.floor(e("bays")*3)},(o,l)=>({at:e(`bay${l}`)*Math.PI*2,depth:.14+e(`bayd${l}`)*.18,width:.18+e(`bayw${l}`)*.25}))},i=Fc[Math.floor(e("biome")*Fc.length)%Fc.length];let s=390*Math.sqrt(t),a=Jf(r,s,n,i);for(let o=0;o<4;o+=1){const l=a.blocks.reduce((c,h)=>c+h.parcels.length,0);if(l>=Kf(t))break;s*=Math.sqrt(Kf(t)/Math.max(1,l))*1.04,a=Jf(r,s,n,i)}return{...a,scaleTier:t,biome:i}}function Jf(r,t,e,n){const i=z=>Ft(`${r}:${z}`),s=i("river")*3,a=z=>{let O=1;for(const W of e.harmonics)O+=W.a*Math.cos(W.k*z+W.p);for(const W of e.bays){const Q=Math.atan2(Math.sin(z-W.at),Math.cos(z-W.at));O-=W.depth*Math.exp(-(Q*Q)/(W.width*W.width))}return O+=Fs(Math.cos(z)*2.2,Math.sin(z)*2.2,r+17,3)*.07,Math.max(.45,O)},o=Array.from({length:96},(z,O)=>{const W=O/96*Math.PI*2,Q=a(W)*t,dt=Math.cos(W)*Q*e.stretch,ht=Math.sin(W)*Q/e.stretch;return{x:dt*Math.cos(e.spin)-ht*Math.sin(e.spin),z:dt*Math.sin(e.spin)+ht*Math.cos(e.spin)}}),l=o.reduce((z,O)=>({minX:Math.min(z.minX,O.x),maxX:Math.max(z.maxX,O.x),minZ:Math.min(z.minZ,O.z),maxZ:Math.max(z.maxZ,O.z)}),{minX:1/0,maxX:-1/0,minZ:1/0,maxZ:-1/0}),c=i("hasRiver")<.82,h=(l.maxX-l.minX)/2,d=(l.minX+l.maxX)/2+(i("riverShift")-.5)*h*.5,u=(.04+i("riverAmp")*.07)*t*(i("riverMirror")<.5?-1:1),f=z=>c?d+u*Math.sin(z*.006+s)+.03*t*Math.sin(z*.014):d,m=z=>c?16+4*Math.cos(z*.012)+Dc(l.minZ+(l.maxZ-l.minZ)*.55,l.maxZ,z)*34:-1e6,_=c?Array.from({length:121},(z,O)=>{const W=l.minZ-60+O*((l.maxZ-l.minZ+120)/120);return{x:f(W),z:W}}):[],p=Array.from({length:721},(z,O)=>a(O/720*Math.PI*2)*t),g=Math.min(e.stretch,1/e.stretch)*.92,v=Math.cos(e.spin),M=Math.sin(e.spin),x=(z,O)=>{const W=z*v+O*M,Q=-z*M+O*v,dt=W/e.stretch,ht=Q*e.stretch;let I=Math.atan2(ht,dt);I<0&&(I+=Math.PI*2);const lt=I/(Math.PI*2)*720,J=Math.floor(lt);return(p[J]+(p[Math.min(720,J+1)]-p[J])*(lt-J)-Math.hypot(dt,ht))*g},b=(z,O)=>Math.min(x(z,O),Math.abs(z-f(O))-m(O)),S=i("hillAngle")*Math.PI*2,T={x:Math.cos(S),z:Math.sin(S)},y=Math.max(...o.map(z=>z.x*T.x+z.z*T.z)),A=y*.6,E=(z,O)=>z*T.x+O*T.z,P=(z,O)=>{const W=b(z,O);if(W<0)return-.65-Math.min(5,-W*.25);const Q=Dc(A-10,A+y*.3,E(z,O))*(30+65*Fs(z*.012,O*.013,r,4));return Dc(0,10,W)*(1.2+Q)},D=(z,O)=>b(z,O)>12&&E(z,O)<A-12,N={height:P,slope:(z,O)=>Math.hypot(P(z+1,O)-P(z-1,O),P(z,O+1)-P(z,O-1))/2,buildable:D,center:{x:0,z:0},radius:t*1.3,coastRadius:()=>t,hasRiver:c};let R={x:d,z:0},B=-1/0;for(let z=0;z<=24;z+=1)for(let O=0;O<=24;O+=1){const W=l.minX+(l.maxX-l.minX)*z/24,Q=l.minZ+(l.maxZ-l.minZ)*O/24;if(!D(W,Q))continue;const dt=x(W,Q),ht=c?Math.abs(Math.abs(W-f(Q))-m(Q)-70):0,I=-Math.abs(dt-.32*t)-ht*.6-Math.max(0,E(W,Q)-A*.4)*.8+i(`core${z}:${O}`)*8;I>B&&(B=I,R={x:W,z:Q})}const V=(z,O,W,Q,dt)=>{for(let ht=0;ht<=60;ht+=1){const I=Math.max(1,ht*8);for(let lt=0;lt<I;lt+=1){const J=lt/I*Math.PI*2+ht*.37,gt={x:z.x+Math.cos(J)*ht*12,z:z.z+Math.sin(J)*ht*12};if(!(b(gt.x,gt.z)<O||E(gt.x,gt.z)>A-O*.5)&&!W.some(vt=>Math.hypot(vt.x-gt.x,vt.z-gt.z)<vt.radius+Q+20)&&!(dt&&!dt(gt)))return gt}}return z},Y=(z,O)=>({x:R.x+Math.cos(z)*O,z:R.z+Math.sin(z)*O}),it=i("siteTurn")*Math.PI*2,Z=[],j=(z,O)=>z==="harbor"?24:O+14,ct=(z,O,W,Q,dt)=>{const ht=V(W,j(O,Q),Z,Q);Z.push({id:z,kind:O,x:ht.x,z:ht.z,radius:Q,yaw:dt})};ct("civic-square","civic",R,44,-.15),ct("observation-tower","tower",Y(it+.9,.16*t),26,0),ct("central-station","station",Y(it+2.2,.38*t),46,.12),ct("riverside-park","park",c?{x:f(R.z+.18*t)+m(R.z)+60,z:R.z+.18*t}:Y(it+3.6,.3*t),47,0),ct("east-stadium","stadium",Y(it+4.8,.45*t),49,.2);{const z=[...o].sort((dt,ht)=>Math.hypot(dt.x-R.x,dt.z-R.z)-Math.hypot(ht.x-R.x,ht.z-R.z))[0],O=Math.max(1,Math.hypot(R.x-z.x,R.z-z.z)),W=Math.min(37*.7,O*.5),Q={x:z.x+(R.x-z.x)/O*W,z:z.z+(R.z-z.z)/O*W};ct("working-harbor","harbor",Q,37,-Math.atan2(z.z-R.z,z.x-R.x))}const xt=[];{const z=[...o].sort((I,lt)=>Math.hypot(I.x-R.x,I.z-R.z)-Math.hypot(lt.x-R.x,lt.z-R.z)),O=(I,lt)=>({x:I.x+(R.x-I.x)*lt,z:I.z+(R.z-I.z)*lt}),W=()=>[...Z,...xt].map(I=>({x:I.x,z:I.z,radius:I.radius})),Q=[{kind:"tv-tower",weight:2,site:()=>({at:Y(it+.4,.14*t),radius:16,clearance:20,yaw:0})},{kind:"twin-towers",weight:1,site:()=>({at:Y(it+3.1,.12*t),radius:22,clearance:20,yaw:it})},{kind:"twist-tower",weight:1,site:()=>({at:Y(it+2.6,.17*t),radius:16,clearance:20,yaw:0})},{kind:"arch",weight:1,site:()=>({at:Y(it+5.6,.26*t),radius:18,clearance:20,yaw:it+5.6})},{kind:"sail-opera",weight:2,site:()=>{const I=z[Math.min(z.length-1,3)];return{at:O(I,.1),radius:34,clearance:16,yaw:-Math.atan2(I.z-R.z,I.x-R.x)}}},{kind:"lighthouse",weight:2,site:()=>{const I=z[z.length-1];return{at:O(I,.04),radius:12,clearance:6,yaw:0}}},{kind:"ferris-wheel",weight:2,site:()=>{const I=z[Math.floor(z.length*.45)];return{at:O(I,.08),radius:26,clearance:14,yaw:-Math.atan2(I.z-R.z,I.x-R.x)+Math.PI/2}}},{kind:"pagoda",weight:n==="eastasian"?5:1,site:()=>({at:{x:T.x*(A-80),z:T.z*(A-80)},radius:18,clearance:18,yaw:S})}],dt=2+(i("landmarkCount")<.5?1:0),ht=[...Q];for(let I=0;I<dt&&ht.length;I+=1){const lt=ht.reduce((wt,de)=>wt+de.weight,0);let J=i(`landmark${I}`)*lt,gt=0;for(;gt<ht.length-1&&J>=ht[gt].weight;)J-=ht[gt].weight,gt+=1;const vt=ht.splice(gt,1)[0];if(vt.kind==="twin-towers"||vt.kind==="twist-tower")for(let wt=ht.length-1;wt>=0;wt-=1)(ht[wt].kind==="twin-towers"||ht[wt].kind==="twist-tower")&&ht.splice(wt,1);const ut=vt.site();if(!ut)continue;const St=V(ut.at,ut.clearance,W(),ut.radius);xt.push({id:`landmark:${vt.kind}`,kind:vt.kind,x:St.x,z:St.z,yaw:ut.yaw,radius:ut.radius})}}const _t=()=>[...Z,...xt],kt=new Map,zt=new Map,Dt=z=>({x:Math.round(z.x*100)/100,z:Math.round(z.z*100)/100}),st=(z,O,W,Q=!1)=>{const dt=Dt(z),ht=Dt(O),I=Uc(dt),lt=Uc(ht);if(I===lt)return;const J=[I,lt].sort().join("/");kt.set(I,{...dt,id:I}),kt.set(lt,{...ht,id:lt}),zt.has(J)||zt.set(J,{id:J,from:I,to:lt,width:W?8:5,kind:W?"arterial":"local",points:[dt,ht],bridge:Q})},rt=(z,O)=>c&&x(z,O)>0&&Math.abs(z-f(O))<m(O),Mt=5+Math.floor(i("trunks")*2),Lt=i("trunkBase")*Math.PI*2,yt=[],Bt=[];for(let z=0;z<Mt;z+=1){const O=Lt+z/Mt*Math.PI*2+(i(`trunkJ${z}`)-.5)*.35,W={x:Math.cos(O),z:Math.sin(O)};if(W.x*T.x+W.z*T.z>Math.cos(40*Math.PI/180))continue;const Q=[R];let dt=0;for(let ht=1;ht<400;ht+=1){const I={x:R.x+W.x*ht*12,z:R.z+W.z*ht*12};if(rt(I.x,I.z)){if(dt+=12,dt>140)break;continue}if(x(I.x,I.z)<=0||E(I.x,I.z)>=A-12)break;if(dt>0){if(!D(I.x,I.z))continue;const lt=Q[Q.length-1];Bt.push({from:lt,to:I,angle:Math.atan2(I.z-lt.z,I.x-lt.x),length:Math.hypot(I.x-lt.x,I.z-lt.z)}),st(lt,I,!0,!0),Q.push(I),dt=0;continue}ht%3===0&&Q.push(I)}if(!(Q.length<3)){for(let ht=1;ht<Q.length;ht+=1)Bt.some(lt=>lt.to===Q[ht])||st(Q[ht-1],Q[ht],!0);yt.push({angle:O,points:Q})}}yt.sort((z,O)=>z.angle-O.angle);const _e=new Nc(yt.map(z=>z.points)),Gt=.55*t,Vt=[];let Kt=[];for(let z=0;z<=96;z+=1){const O=z/96*Math.PI*2,W=Gt*(1+.08*Fs(Math.cos(O)*1.7,Math.sin(O)*1.7,r+91,2)),Q={x:R.x+Math.cos(O)*W,z:R.z+Math.sin(O)*W};x(Q.x,Q.z)>0&&E(Q.x,Q.z)<A-12?Kt.push(Q):(Kt.length>=6&&Vt.push(Kt),Kt=[])}Kt.length>=6&&Vt.push(Kt);for(const z of[...Z,...xt]){if(!z.radius||zs(z,z.radius*2,z.radius*2,Vt))continue;const O=[...Z,...xt].filter(Q=>Q!==z).map(Q=>({x:Q.x,z:Q.z,radius:Q.radius})),W=V(z,j(z.kind,z.radius),O,z.radius,Q=>zs(Q,z.radius*2,z.radius*2,Vt));z.x=W.x,z.z=W.z}const Ht=new Nc(Vt),ee=z=>Math.hypot(z.x-R.x,z.z-R.z)<.24*t?"downtown":x(z.x,z.z)<90?"waterfront":_e.closerThan(z,60)?"commercial":"residential",fe=[],Le=(z,O,W)=>{const Q=((W-O)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)||Math.PI*2,dt=((z-O)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);return dt>0&&dt<Q};(yt.length?yt.map((z,O)=>({lo:z.angle,hi:yt[(O+1)%yt.length].angle})):[{lo:0,hi:Math.PI*2}]).forEach((z,O)=>{const W=((z.hi-z.lo)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)||Math.PI*2,Q=z.lo+W/2,dt={x:Math.cos(Q),z:Math.sin(Q)},ht={x:-dt.z,z:dt.x},I=44+i(`du${O}`)*10,lt=40+i(`dv${O}`)*12,J=(vt,ut)=>({x:R.x+dt.x*vt*I+ht.x*ut*lt,z:R.z+dt.z*vt*I+ht.z*ut*lt}),gt=Math.ceil(t*1.6/Math.min(I,lt));for(let vt=1;vt<gt;vt+=1)for(let ut=-gt;ut<gt;ut+=1){const St=[J(vt,ut),J(vt+1,ut),J(vt+1,ut+1),J(vt,ut+1)],wt=J(vt+.5,ut+.5),de=Math.atan2(wt.z-R.z,wt.x-R.x);if(!Le(de,z.lo,z.hi)||St.some(Me=>!Le(Math.atan2(Me.z-R.z,Me.x-R.x),z.lo,z.hi))||St.some(Me=>!D(Me.x,Me.z))||St.some((Me,In)=>{const Ln=St[(In+1)%4];return!D((Me.x+Ln.x)/2,(Me.z+Ln.z)/2)})||[wt,...St].some(Me=>_e.closerThan(Me,10))||[wt,...St].some(Me=>Ht.closerThan(Me,9)))continue;const oe=_t().some(Me=>Zf(Me,St)>-Me.radius),pn=ee(wt),mn=`plan:${O}:${vt}:${ut}`,lo=[],jc=Math.hypot(St[1].x-St[0].x,St[1].z-St[0].z),Vs=Math.max(3,Math.floor((jc-14)/7.2));for(let Me=0;Me<2&&!oe;Me+=1)for(let In=0;In<Vs;In+=1){const Ln=St[Me===0?0:3],Dn=St[Me===0?1:2],_i=Math.hypot(Dn.x-Ln.x,Dn.z-Ln.z),Hs=(Dn.x-Ln.x)/_i,Gs=(Dn.z-Ln.z)/_i,Ki=(In+.5)/Vs,Gr=Me===0?12:-12,ri={x:Ln.x+Hs*(7+(_i-14)*Ki)-Gs*Gr,z:Ln.z+Gs*(7+(_i-14)*Ki)+Hs*Gr};Zf(ri,St)<3.6+5||_t().some(Ws=>Math.hypot(ri.x-Ws.x,ri.z-Ws.z)<Ws.radius+9)||zs(ri,7.2,8,Ht)&&lo.push({...ri,id:`${mn}/${Me}:${In}`,blockId:mn,yaw:-Math.atan2(Gs,Hs),zone:pn,width:Math.min(7.2,(_i-14)/Vs),depth:8})}const Hr=Me=>Dt(Me);fe.push({id:mn,districtId:"",...wt,width:I,depth:lt,zone:pn,parcels:lo,polygon:St.map(Hr)}),St.forEach((Me,In)=>st(Me,St[(In+1)%4],In%2===0?ut%3===0:vt%3===0))}});{const z=new Map,O=ht=>{let I=ht;for(;z.get(I)!==I;)I=z.get(I);let lt=ht;for(;z.get(lt)!==I;){const J=z.get(lt);z.set(lt,I),lt=J}return I};for(const ht of kt.keys())z.set(ht,ht);for(const ht of zt.values()){const I=O(ht.from),lt=O(ht.to);I!==lt&&z.set(I,lt)}const W=Uc(Dt(R)),Q=yt.flatMap(ht=>ht.points.map(I=>Dt(I))),dt=new Map;for(const ht of kt.values()){const I=O(ht.id),lt=dt.get(I);lt?lt.push(ht):dt.set(I,[ht])}for(const[ht,I]of dt){if(kt.has(W)&&ht===O(W))continue;let lt=null;for(const J of I)for(const gt of Q){const vt=Math.hypot(J.x-gt.x,J.z-gt.z);(!lt||vt<lt.d)&&(lt={a:J,b:gt,d:vt})}lt&&lt.d<400&&st(lt.a,lt.b,!1)}}{const O=new Map;for(const W of zt.values()){const[Q,dt]=W.points;for(let ht=Math.floor(Math.min(Q.x,dt.x)/60)-1;ht<=Math.floor(Math.max(Q.x,dt.x)/60)+1;ht+=1)for(let I=Math.floor(Math.min(Q.z,dt.z)/60)-1;I<=Math.floor(Math.max(Q.z,dt.z)/60)+1;I+=1){const lt=`${ht}:${I}`,J=O.get(lt);J?J.push(W):O.set(lt,[W])}}for(const W of fe)W.parcels=W.parcels.filter(Q=>{const dt=Math.hypot(Q.width,Q.depth)/2;return(O.get(`${Math.floor(Q.x/60)}:${Math.floor(Q.z/60)}`)??[]).every(ht=>Br(Q,ht.points[0],ht.points[1])>=dt+ht.width/2+.5)})}const se=[],H=l.maxX-l.minX+120,Ce=l.maxZ-l.minZ+120,Yt=60,U=new Map;for(const z of zt.values()){const[O,W]=z.points;for(let Q=Math.floor(Math.min(O.x,W.x)/Yt)-1;Q<=Math.floor(Math.max(O.x,W.x)/Yt)+1;Q+=1)for(let dt=Math.floor(Math.min(O.z,W.z)/Yt)-1;dt<=Math.floor(Math.max(O.z,W.z)/Yt)+1;dt+=1){const ht=`${Q}:${dt}`,I=U.get(ht);I?I.push(z):U.set(ht,[z])}}const w=(z,O)=>Math.hypot(P(z+1,O)-P(z-1,O),P(z,O+1)-P(z,O-1))/2;for(let z=0;z<2600;z+=1){const O=l.minX-60+i(`tx${z}`)*H,W=l.minZ-60+i(`tz${z}`)*Ce,Q=P(O,W),dt=Z.some(J=>J.kind==="park"&&Math.hypot(O-J.x,W-J.z)<J.radius-5),ht=Math.abs(O-f(W))-m(W),I=Q>3.2&&Q<60&&w(O,W)<1.5,lt=E(O,W)>A-20||x(O,W)<30||I;Q<2.5||!dt&&!lt&&!(c&&ht<23)||(U.get(`${Math.floor(O/Yt)}:${Math.floor(W/Yt)}`)??[]).some(J=>Br({x:O,z:W},J.points[0],J.points[1])<J.width/2+3)||se.push({x:O,z:W,y:P(O,W),seed:i(`tree${z}`)})}const q=fe.filter((z,O)=>z.parcels.length>0&&O%7===0).map(z=>[...z.polygon,z.polygon[0]]),K=[],ot=[R,Y(it+1.6,.42*t),Y(it+3.7,.42*t),Y(it+5.3,.42*t)];for(const z of ot){const O=V(z,40,[...K,...Z.map(W=>({x:W.x,z:W.z,radius:W.radius*.4}))],90);K.push({...O,radius:90})}const k=K.map(({x:z,z:O})=>({x:z,z:O})),$=Vt,X={left:l.minX+30,right:l.maxX-30,north:l.minZ+30,south:l.maxZ-30},nt=Math.max(l.maxX-l.minX,l.maxZ-l.minZ)/2+40,mt=Math.ceil((Math.max(Math.abs(l.minX),Math.abs(l.maxX),Math.abs(l.minZ),Math.abs(l.maxZ))+260)*2/100)*100;return{blocks:fe,roadNodes:[...kt.values()],roadEdges:[...zt.values()],terrain:N,extent:mt,coast:o,river:_,publicSites:Z,parkTrees:se,urbanBounds:X,bridges:Bt,boundsRadius:nt,carPaths:q,districtAnchors:k,highways:$,core:R,islandRadius:t,landmarks:Fy(xt,Bt,i)}}function Fy(r,t,e){if(!t.length||e("suspension")>.55)return r;const n=[...t].sort((i,s)=>s.length-i.length)[0];return[...r,{id:"landmark:suspension-bridge",kind:"suspension-bridge",x:n.from.x,z:n.from.z,to:n.to,yaw:n.angle,radius:0}]}const jf=45,Qf=["school","mall","hospital"],td=new Map;function zy(r,t,e,n,i){const s=e.reduce((c,h)=>c+h.tokensTotal,0),a=Math.max(1,Math.min(9,Math.round(e.length/36)));new Set(n.map(c=>c.id));const o=Math.ceil(e.length/a),l=[];for(let c=0;c<a;c+=1){const h=Ft(`${r}:mass:${c}`)*Math.PI*2;let d=null;for(let u=6;u<=26&&!d;u+=2){const f=60+u*9,m=t.x+Math.cos(h)*f,_=t.z+Math.sin(h)*f;i.terrain.buildable(m,_)&&zs({x:m,z:_},30,30,i.highways)&&(i.blocks.some(p=>p.parcels.length>0&&Math.hypot(p.x-m,p.z-_)<46)||l.some(p=>Math.hypot(p.x-m,p.z-_)<34)||(d={x:m,z:_}))}d&&l.push({districtId:r,x:d.x,z:d.z,y:Math.max(.3,i.terrain.height(d.x,d.z)),count:c===a-1?e.length-o*(a-1):o,tokens:Math.round(s/a),height:9+Ft(`${r}:mh:${c}`)*8})}return l}function Oy(r,t,e=1927){const n=Uy(r.buildings.length),i=`${e}:${n}`;let s=td.get(i);s||(s=Ny(e,n),td.set(i,s));const a=s.blocks.flatMap(N=>N.parcels),o=new Map(a.map(N=>[N.id,N])),l=new Map,c=new Set;if((t==null?void 0:t.seed)===e&&t.scaleTier!==n&&t.islandRadius>0){const N=s.islandRadius/t.islandRadius,R=new Map(t.districts.flatMap(it=>[...it.slots])),B=40,V=new Map;for(const it of a){const Z=`${Math.floor(it.x/B)}:${Math.floor(it.z/B)}`,j=V.get(Z);j?j.push(it):V.set(Z,[it])}const Y=[...r.buildings].filter(it=>R.has(it.id)).sort((it,Z)=>it.startedAt-Z.startedAt||it.id.localeCompare(Z.id));for(const it of Y){const Z=R.get(it.id),j=Z.x*N,ct=Z.z*N,xt=Math.floor(j/B),_t=Math.floor(ct/B);let kt=null,zt=1/0;for(let Dt=0;Dt<=3&&!kt;Dt+=1)for(let st=xt-Dt;st<=xt+Dt;st+=1)for(let rt=_t-Dt;rt<=_t+Dt;rt+=1)if(Math.max(Math.abs(st-xt),Math.abs(rt-_t))===Dt)for(const Mt of V.get(`${st}:${rt}`)??[]){if(c.has(Mt.id))continue;const Lt=Math.hypot(Mt.x-j,Mt.z-ct);Lt<zt&&(zt=Lt,kt=Mt)}kt&&zt<=120&&(l.set(it.id,kt),c.add(kt.id))}}if((t==null?void 0:t.seed)===e&&t.scaleTier===n){const N=new Map(t.districts.flatMap(R=>[...R.slots]));for(const R of r.buildings){const B=N.get(R.id);B&&o.has(B.id)&&!c.has(B.id)&&(l.set(R.id,o.get(B.id)),c.add(B.id))}}const h=[...r.districts].sort((N,R)=>R.sessionCount-N.sessionCount||(N.id<R.id?-1:1)).filter(N=>r.buildings.some(R=>R.districtId===N.id)),d=new Map(h.map(N=>[N.id,r.buildings.filter(R=>R.districtId===N.id).length])),u=[...d.values()].reduce((N,R)=>N+R,0)||1,f=s.core,m=Ft(`${e}:wedge`)*Math.PI*2,_=N=>((Math.atan2(N.z-f.z,N.x-f.x)-m)%(Math.PI*2)+Math.PI*2)%(Math.PI*2),p=s.blocks.filter(N=>N.parcels.length>0).sort((N,R)=>_(N)-_(R)||N.id.localeCompare(R.id)),g=p.reduce((N,R)=>N+R.parcels.length,0),v=new Map;{let N=0,R=0,B=0;for(const V of h)for(B+=d.get(V.id)/u*g;N<p.length&&(R<B||V===h[h.length-1]);)v.set(p[N].id,V.id),R+=p[N].parcels.length,N+=1}const M=N=>p.filter(R=>v.get(R.id)===N),x=new Map;for(const N of h){const R=M(N.id).sort((V,Y)=>Math.hypot(V.x-f.x,V.z-f.z)-Math.hypot(Y.x-f.x,Y.z-f.z)),B=R[Math.min(R.length-1,Math.floor(R.length*.3))];x.set(N.id,B?{x:B.x,z:B.z}:f)}const b=[];for(const N of h){const R=x.get(N.id),B=M(N.id).filter(V=>V.parcels.every(Y=>!c.has(Y.id))&&zs(V,V.width,V.depth,s.highways)).sort((V,Y)=>Math.hypot(V.x-R.x,V.z-R.z)-Math.hypot(Y.x-R.x,Y.z-R.z)||V.id.localeCompare(Y.id))[0];if(B){for(const V of B.parcels)c.add(V.id);b.push({id:`garden:${N.id}`,districtId:N.id,blockId:B.id,x:B.x,z:B.z,y:s.terrain.height(B.x,B.z),yaw:B.parcels[0].yaw,width:B.width,depth:B.depth,seed:Ft(`garden:${N.id}`)})}}const S=r.buildings.filter(N=>!l.has(N.id)),T=[];for(const N of h){const R=x.get(N.id),B=S.filter(j=>j.districtId===N.id).sort((j,ct)=>j.startedAt-ct.startedAt||ct.height-j.height||j.id.localeCompare(ct.id));if(!B.length)continue;const V=j=>Math.hypot(j.x-R.x,j.z-R.z)+Ft(j.id)*6,Y=M(N.id).flatMap(j=>j.parcels).filter(j=>!c.has(j.id)).sort((j,ct)=>V(j)-V(ct)||j.id.localeCompare(ct.id)),it=[];let Z=0;for(const j of B){for(;Z<Y.length&&c.has(Y[Z].id);)Z+=1;let ct=Y[Z];if(ct?Z+=1:ct=a.filter(xt=>!c.has(xt.id)).sort((xt,_t)=>V(xt)-V(_t)||xt.id.localeCompare(_t.id))[0],!ct){it.push(j);continue}l.set(j.id,ct),c.add(ct.id)}it.length&&T.push(...zy(N.id,R,it,a,s))}const y=By(r,a,c,l,t??null,s),A=r.districts.map((N,R)=>{const B=r.buildings.filter(xt=>xt.districtId===N.id&&l.has(xt.id)),V=new Map(B.map(xt=>[xt.id,l.get(xt.id)])),Y=[...V.values()],it=Y.length?{x:Y.reduce((xt,_t)=>xt+_t.x,0)/Y.length,z:Y.reduce((xt,_t)=>xt+_t.z,0)/Y.length}:{x:0,z:0},Z=Y[0]??{x:-160,z:-100},j=s.publicSites.filter(xt=>xt.kind==="civic"||xt.kind==="park"||xt.kind==="station").sort((xt,_t)=>Math.hypot(xt.x-it.x,xt.z-it.z)-Math.hypot(_t.x-it.x,_t.z-it.z))[0],ct=j?{x:j.x,z:j.z,y:Math.max(.4,s.terrain.height(j.x,j.z))}:{...Z,y:3};return{id:N.id,label:N.label,center:it,radius:Math.max(30,...Y.map(xt=>Math.hypot(xt.x-it.x,xt.z-it.z))),terrain:s.terrain,slots:V,grounds:new Map(Y.map((xt,_t)=>[B[_t].id,s.terrain.height(xt.x,xt.z)])),roads:[],carPaths:R===0?s.carPaths:[],river:s.river,riverHalfWidth:18,trees:[],plaza:ct,anomaly:N.anomaly?{severity:N.anomaly.severity,count:N.anomaly.count}:null,sessionCount:N.sessionCount}}),E=ky(s.coast),P=[1.24,1.36,1.5].map((N,R)=>{const B=s.coast.map(V=>({x:E.x+(V.x-E.x)*N,z:E.z+(V.z-E.z)*N}));return[...B,B[0]]}),D=[{center:{x:E.x+980,z:E.z-320},radius:120,height:88,seed:71},{center:{x:E.x-1020,z:E.z+260},radius:150,height:108,seed:37}];return{...s,districts:A,seed:e,massing:T,civics:y,gardens:b,boatLanes:[],decorMountains:[],boatLoops:P,seaMountains:D}}function By(r,t,e,n,i,s){const a=r.buildings.length,o=a===0?0:Math.max(2,Math.min(30,Math.floor(a/jf)));if(!o)return[];const l=r.buildings.map(M=>M.startedAt).sort((M,x)=>M-x),c=r.districts.map(M=>({id:M.id,n:r.buildings.filter(x=>x.districtId===M.id).length})).filter(M=>M.n>0),h=c.reduce((M,x)=>M+x.n,0)||1,d=c.map(M=>({id:M.id,exact:M.n/h*o,take:Math.floor(M.n/h*o)}));let u=o-d.reduce((M,x)=>M+x.take,0);[...d].sort((M,x)=>x.exact-x.take-(M.exact-M.take)||(M.id<x.id?-1:1)).forEach(M=>{u>0&&(M.take+=1,u-=1)});const f=[];for(let M=0;f.length<o;M+=1)for(const x of[...d].sort((b,S)=>S.take-b.take||(b.id<S.id?-1:1)))M<x.take&&f.push(x.id);const m=s.blocks.filter(M=>M.parcels.length>0&&M.parcels.every(x=>!e.has(x.id))&&zs(M,M.width,M.depth,s.highways)).map(M=>({id:M.id,x:M.x,z:M.z,yaw:M.parcels[0].yaw,width:M.width,depth:M.depth,zone:M.zone})),_=new Set,p=[],g=new Map(((i==null?void 0:i.civics)??[]).map(M=>[M.id,M])),v=new Map;return f.forEach((M,x)=>{const b=g.get(`civic:${x}`);b&&m.some(S=>S.id===b.parcelId)&&v.set(b.parcelId,`civic:${x}`)}),f.forEach((M,x)=>{var P;const b=`civic:${x}`,S=Qf[x%Qf.length],T=l[Math.min(l.length-1,(x+1)*jf-1)]??l[l.length-1],y=g.get(b);let A=y&&v.get(y.parcelId)===b?m.find(D=>D.id===y.parcelId&&!_.has(D.id)):void 0;const E=A&&y?y.districtId:M;if(!A){const D=r.buildings.filter(V=>V.districtId===M).map(V=>n.get(V.id)).filter(V=>!!V);if(!D.length)return;const N=D.reduce((V,Y)=>V+Y.x,0)/D.length,R=D.reduce((V,Y)=>V+Y.z,0)/D.length,B={school:["residential"],mall:["downtown","commercial","waterfront"],hospital:["downtown","commercial","residential"]};A=(P=m.filter(V=>!_.has(V.id)&&!v.has(V.id)&&p.every(Y=>Math.hypot(Y.x-V.x,Y.z-V.z)>=60)).map(V=>{const Y=Math.min(150,...p.map(j=>Math.hypot(j.x-V.x,j.z-V.z))),it=B[S].indexOf(V.zone),Z=it<0?60:it*15;return{p:V,d:Math.hypot(V.x-N,V.z-R)*.35-Y*.7+Z+Ft(`${b}:${V.id}`)*10}}).sort((V,Y)=>V.d-Y.d||V.p.id.localeCompare(Y.p.id))[0])==null?void 0:P.p}A&&(_.add(A.id),p.push({id:b,kind:S,districtId:E,parcelId:A.id,x:A.x,z:A.z,y:s.terrain.height(A.x,A.z),yaw:A.yaw,width:A.width,depth:A.depth,unlockAt:T}))}),p}function ky(r){let t=0,e=0;for(const n of r)t+=n.x,e+=n.z;return{x:t/r.length,z:e/r.length}}function Vy(r){const t=new Map;for(const l of r)for(const c of[l.from,l.to]){const h=t.get(c)??[];h.push(l),t.set(c,h)}const e=new Set([...t].filter(([,l])=>l.length>=3).map(([l])=>l)),n=new Set,i=[],s=(l,c)=>{const h=t.get(c);if(h.length===2)return h.find(d=>d!==l&&!d.bridge&&d.width===l.width&&d.kind===l.kind)},a=(l,c)=>{const h=[];let d=l,u=c;for(;!n.has(d.id);){n.add(d.id);const f=d.from===u?d.points:[...d.points].reverse();h.push(...h.length?f.slice(1):f),u=d.from===u?d.to:d.from;const m=s(d,u);if(!m||n.has(m.id))break;d=m}i.push({width:l.width,kind:l.kind,points:h,from:c,to:u})},o=r.filter(l=>!l.bridge);for(const l of o)n.has(l.id)||(s(l,l.from)?s(l,l.to)||a(l,l.to):a(l,l.from));for(const l of o)n.has(l.id)||a(l,l.from);return{runs:i,junctions:e}}function Os(r=1,t=1){if(typeof document>"u")return new OffscreenCanvas(r,t);const e=document.createElement("canvas");return e.width=r,e.height=t,e}function zc(r){const t=r.getContext("2d");if(!t)throw new Error("canvas 2d context unavailable");return t}function kr(r){const t=ce();return t.harnesses[r]??t.fallback}function Bs(r,t){const e=Os(r,Math.max(1,t)),n=zc(e);return{canvas:e,ctx:n}}function Hy(){const{canvas:t,ctx:e}=Bs(256,256);e.fillStyle="#fbf8f2",e.fillRect(0,0,256,256);for(let i=0;i<2;i+=1){const s=i*128;e.fillStyle="#5f8d96",e.beginPath(),e.roundRect(22,s+44,212,40,14),e.fill(),e.fillStyle="rgba(255, 255, 255, 0.28)",e.fillRect(30,s+50,196,6);for(let a=1;a<6;a+=1)e.fillStyle="#e9e3d8",e.fillRect(22+a*(212/6)-2,s+44,4,40);for(let a=0;a<3;a+=1)e.fillStyle="#ffffff",e.fillRect(0,s+98+a*7,256,3),e.fillStyle="rgba(90, 80, 70, 0.22)",e.fillRect(0,s+101+a*7,256,2)}e.fillStyle="#f3eee6",e.fillRect(256/2-12,0,24,256),e.fillStyle="rgba(90, 80, 70, 0.18)",e.fillRect(256/2+12,0,3,256);const n=new Re(t);return n.wrapS=n.wrapT=hn,n.anisotropy=4,n.needsUpdate=!0,n}function Oc(r,t){const{canvas:e,ctx:n}=Bs(128,128);if(n.fillStyle="#f4f1ea",n.fillRect(0,0,128,128),r===0){for(let s=0;s<4;s+=1)for(let a=0;a<5;a+=1){const o=Ft(`w${t}:${s}:${a}`)>.86;n.fillStyle=o?"#f7e3ae":"#4f5d6a",n.fillRect(4+a*24,5+s*32,20,24)}n.fillStyle="rgba(120, 108, 92, 0.14)";for(let s=0;s<4;s+=1)n.fillRect(0,s*32+28,128,2)}else if(r===1)for(let s=0;s<4;s+=1){n.fillStyle="#4d5c68",n.fillRect(0,s*32+3,128,25),n.fillStyle="#e9e5d8";for(let a=0;a<4;a+=1)n.fillRect(a*32,s*32+3,2,25);Ft(`b${t}:${s}`)>.8&&(n.fillStyle="#f3dfa6",n.fillRect(34+s%2*32,s*32+3,30,25))}else{n.fillStyle="#45586a",n.fillRect(0,0,128,128);for(let s=0;s<4;s+=1)for(let a=0;a<4;a+=1){const o=Ft(`g${t}:${s}:${a}`);o>.93?(n.fillStyle="#f2dfae",n.fillRect(a*32+1,s*32+2,31,29)):(n.fillStyle=`rgba(${o>.5?"70,92,110":"58,76,94"}, 1)`,n.fillRect(a*32+1,s*32+2,31,29))}n.fillStyle="#c9d0d3";for(let s=0;s<4;s+=1)n.fillRect(0,s*32,128,2);for(let s=0;s<4;s+=1)n.fillRect(s*32,0,1,128)}const i=new Re(e);return i.wrapS=i.wrapT=hn,i.anisotropy=4,i.needsUpdate=!0,i}function Bc(r,t,e,n){t.length&&(r.beginPath(),t.forEach((i,s)=>{const[a,o]=e(i.x,i.z);s===0?r.moveTo(a,o):r.lineTo(a,o)}),r.stroke())}function Gy(r){const{canvas:e,ctx:n}=Bs(2048,2048),i=2048/r.extent,s=(v,M)=>[(v+r.extent/2)*i,(M+r.extent/2)*i],a=Bs(384,384),o=a.ctx.createImageData(384,384),l=iM(ce(),r.biome),c=v=>`#${v.map(M=>Math.max(0,Math.min(255,Math.round(M))).toString(16).padStart(2,"0")).join("")}`,h=(v,M,x)=>v.map((b,S)=>b+(M[S]-b)*x),d=c(h([197,192,179],l.sand,.45)),u=c(h([145,165,127],l.lawn,.6));for(let v=0;v<384;v+=1)for(let M=0;M<384;M+=1){const x=(M/383-.5)*r.extent,b=(v/383-.5)*r.extent,S=r.terrain.height(x,b),T=Ft(`ground:${M}:${v}`)*7,y=l,A=S<0?y.sea:S<2.5?y.sand:S<9?y.lawn:S<35?y.grass:y.rock,E=(v*384+M)*4;o.data[E]=A[0]+T,o.data[E+1]=A[1]+T,o.data[E+2]=A[2]+T,o.data[E+3]=255}a.ctx.putImageData(o,0,0),n.drawImage(a.canvas,0,0,2048,2048);const f=(v,M)=>{n.beginPath(),v.forEach((x,b)=>{const[S,T]=s(x.x,x.z);b===0?n.moveTo(S,T):n.lineTo(S,T)}),n.closePath(),n.fillStyle=M,n.fill()},m=(v,M,x,b,S,T)=>{const[y,A]=s(v,M);n.save(),n.translate(y,A),n.rotate(-S),n.fillStyle=T,n.fillRect(-x*i/2,-b*i/2,x*i,b*i),n.restore()};for(const v of r.blocks){f(v.polygon.map(M=>({x:v.x+(M.x-v.x)*.88,z:v.z+(M.z-v.z)*.88})),v.parcels.length?d:u);for(const M of v.parcels)m(M.x,M.z,M.width-.3,M.depth-.3,M.yaw,"#bcb8ac")}const{runs:_,junctions:p}=Vy(r.roadEdges);n.lineCap="butt",n.lineJoin="round";for(const v of _)n.strokeStyle="#d4cfc2",n.lineWidth=(v.width+2.4)*i,Bc(n,v.points,s);for(const v of _)n.strokeStyle=v.kind==="arterial"?"#505b60":"#646c6b",n.lineWidth=v.width*i,Bc(n,v.points,s);for(const v of r.roadNodes)if(p.has(v.id)){const M=r.roadEdges.filter(T=>T.from===v.id||T.to===v.id),x=Math.max(...M.map(T=>T.width)),[b,S]=s(v.x,v.z);n.fillStyle=M.some(T=>T.kind==="arterial")?"#505b60":"#646c6b",n.beginPath(),n.arc(b,S,x*i/2,0,Math.PI*2),n.fill()}for(const v of _){const M=v.points[0],x=v.points[v.points.length-1],b=v.points[1],S=v.points[v.points.length-2],T=Math.hypot(b.x-M.x,b.z-M.z),y=Math.hypot(x.x-S.x,x.z-S.z),A=p.has(v.from)?6:0,E=p.has(v.to)?6:0;if(T<=A||y<=E)continue;const P=[{x:M.x+(b.x-M.x)*A/T,z:M.z+(b.z-M.z)*A/T},...v.points.slice(1,-1),{x:x.x-(x.x-S.x)*E/y,z:x.z-(x.z-S.z)*E/y}];n.strokeStyle=v.kind==="arterial"?"#d6c998":"#b6bdba",n.lineWidth=.22*i,n.setLineDash([3*i,3*i]),Bc(n,P,s),n.setLineDash([])}for(const v of r.roadEdges){if(v.bridge)continue;const[M,x]=v.points,b=Math.hypot(x.x-M.x,x.z-M.z);if(b<14)continue;const S=(x.x-M.x)/b,T=(x.z-M.z)/b;for(const y of[M,x])if(p.has(y===M?v.from:v.to))for(let A=-2;A<=2;A+=1){const E=y===M?1:-1;m(y.x+S*6.5*E-T*A*.8,y.z+T*6.5*E+S*A*.8,1.4,.4,-Math.atan2(T,S),"#dbd8cb")}}for(const v of r.publicSites){const[M,x]=s(v.x,v.z);if(v.kind==="park")n.fillStyle="#799b71",n.beginPath(),n.ellipse(M,x,v.radius*i,v.radius*.75*i,-.2,0,Math.PI*2),n.fill(),n.strokeStyle="#d2c4a0",n.lineWidth=2.2*i,n.beginPath(),n.ellipse(M,x,v.radius*.75*i,v.radius*.55*i,-.2,0,Math.PI*2),n.stroke();else{if(m(v.x,v.z,v.radius*1.6,v.radius*1.3,v.yaw,v.kind==="harbor"?"#999f98":"#d0c7b3"),v.kind==="civic"&&(n.fillStyle="#609ca3",n.beginPath(),n.arc(M,x+18*i,6*i,0,Math.PI*2),n.fill(),n.strokeStyle="#efdfbd",n.lineWidth=2*i,n.stroke()),v.kind==="station")for(let b=0;b<4;b+=1)m(v.x-18+b*8,v.z,1.2,v.radius*1.15,v.yaw,"#737c76");v.kind==="stadium"&&(n.fillStyle="#647f62",n.beginPath(),n.ellipse(M,x,28*i,19*i,-v.yaw,0,Math.PI*2),n.fill(),n.strokeStyle="#dad9c0",n.lineWidth=.7*i,n.strokeRect(M-18*i,x-10*i,36*i,20*i))}}const g=new Xl(e);return g.anisotropy=8,g}function Wy(r,t,e){const s=Bs(4,4);s.ctx.font="600 46px system-ui, -apple-system, sans-serif";const a=s.ctx.measureText(r).width;s.ctx.font=`400 ${46*.62}px system-ui, -apple-system, sans-serif`;const o=s.ctx.measureText(t).width,l=Math.ceil(Math.max(a,o))+36,c=Math.ceil(46*2.1),{canvas:h,ctx:d}=Bs(l,c),u=18;d.beginPath(),d.roundRect(1,1,l-2,c-2,u),d.fillStyle="rgba(250, 250, 248, 0.92)",d.fill(),d.strokeStyle="rgba(90, 84, 74, 0.28)",d.lineWidth=2,d.stroke(),d.fillStyle="#292d34",d.font="600 46px system-ui, -apple-system, sans-serif",d.fillText(r,18,54),d.fillStyle=e,d.beginPath(),d.arc(25,46*1.62,7,0,Math.PI*2),d.fill(),d.fillStyle="#63748a",d.font=`400 ${46*.62}px system-ui, -apple-system, sans-serif`,d.fillText(t,40,46*1.62+46*.24);const f=new Re(h);return f.needsUpdate=!0,{texture:f,aspect:l/c}}const Ye=new ae(1,1,1).translate(0,.5,0),kc=new je(1,1,1,14).translate(0,.5,0),Xy=8.2,Vr=.9,ed=10.5,Yy=90;function Vc(r,t){const e=[0];for(let i=1;i<r.length;i+=1)e.push(e[i-1]+Math.hypot(r[i].x-r[i-1].x,r[i].z-r[i-1].z));const n=e[e.length-1]||1;return r.map((i,s)=>{const a=Math.min(e[s],n-e[s]),o=Math.min(1,a/Yy),l=o*o*(3-2*o),c=Math.max(0,t(i.x,i.z))+.3-Vr;return c+(Xy-c)*l})}const qy=[[5,4],[1,4],[4,4],[1,2]];function ro(r){const t=new ie({color:"#ffffff"});return t.onBeforeCompile=e=>{e.fragmentShader=e.fragmentShader.replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * ${r.toFixed(3)};`)},t.customProgramCacheKey=()=>`city-self-lit-${r.toFixed(3)}`,t}function Zy(r,t,e){const n=new ie({map:r});return n.onBeforeCompile=i=>{Object.assign(i.uniforms,t),i.vertexShader=i.vertexShader.replace("#include <common>",`#include <common>
attribute float aFloors;
uniform float uRows;
uniform float uPhotoRows;
uniform float uTileWidth;
varying vec2 vPhotoUv;
varying vec3 vFacadeWorld;
varying vec3 vFacadeNormal;
varying float vBuildSeed;`).replace("#include <project_vertex>",`#include <project_vertex>
vFacadeWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
vBuildSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
// 盒子的面法线是轴向的：经实例矩阵（只有 yaw + 缩放）变换后归一化即为世界法线。
vFacadeNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);`).replace("#include <uv_vertex>",`#include <uv_vertex>
#ifdef USE_MAP
vec2 baseUv = vMapUv;
vMapUv.y *= aFloors / uRows;
float faceWidth = abs(normal.x) > 0.5 ? length(instanceMatrix[2].xyz) : length(instanceMatrix[0].xyz);
vPhotoUv = vec2(baseUv.x * faceWidth / max(uTileWidth, 1.0), baseUv.y * aFloors / max(uPhotoRows, 1.0));
#endif`),i.fragmentShader=i.fragmentShader.replace("#include <common>",`#include <common>
uniform float uPhoto;
uniform sampler2D uPhotoTex;
uniform float uSelfLit;
uniform sampler2D uEnv;
uniform float uEnvStrength;
uniform vec3 uGradeTop;
uniform vec3 uGradeHorizon;
uniform float uGradeAmount;
uniform float uSkyYaw;
varying vec2 vPhotoUv;
varying vec3 vFacadeWorld;
varying vec3 vFacadeNormal;
varying float vBuildSeed;
uniform float uWindowGlow;
uniform vec2 uGrid;
float facadeWindow = 0.0;
float cellHash(vec2 c, float s) { return fract(sin(dot(c, vec2(127.1, 311.7)) + s * 91.7) * 43758.5453); }
vec3 facadeSky(vec3 dir) {
  dir = normalize(dir);
  vec2 uv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5 + uSkyYaw, asin(clamp(dir.y, 0.002, 1.0)) / 3.1415927 + 0.5);
  vec3 photo = texture2D(uEnv, uv).rgb;
  vec3 tint = mix(uGradeHorizon, uGradeTop, smoothstep(0.0, 0.6, max(dir.y, 0.0)));
  return mix(photo, photo * tint * 1.55, uGradeAmount);
}`).replace("#include <map_fragment>",`#ifdef USE_MAP
  vec4 facadeTexel = texture2D( map, vMapUv );
  // 窗格遮罩：程序化立面里窗是暗格、墙是亮底。只让窗反光——整面反光的楼像一面镜子。
  facadeWindow = 1.0 - smoothstep(0.22, 0.5, dot(facadeTexel.rgb, vec3(0.2126, 0.7152, 0.0722)));
  diffuseColor *= facadeTexel;
  if (uPhoto > 0.5) {
    float l = dot(texture2D(uPhotoTex, vPhotoUv).rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb *= mix(0.8 + 0.45 * smoothstep(0.03, 0.5, l), 1.0, facadeWindow);
  }
#endif`).replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uSelfLit;
// 夜里亮窗：只有窗格发光，每扇窗按 (楼, 窗格) hash 决定亮不亮，暖黄/冷白两种灯色；墙面保持暗。
// 曾把 uSelfLit 抬到 0.58 作用在整个立面颜色上——墙和窗一起发光，整栋楼是一块奶白色的纸盒。
if (uWindowGlow > 0.02) {
  vec2 cell = floor(vec2(vMapUv.x * uGrid.x, vMapUv.y * uGrid.y));
  float on = step(cellHash(cell, vBuildSeed), (0.28 + 0.5 * vBuildSeed) * smoothstep(0.1, 0.95, uWindowGlow));
  float warm = step(0.35, cellHash(cell + 17.0, vBuildSeed));
  vec3 lamp = mix(vec3(0.62, 0.8, 1.0), vec3(1.0, 0.72, 0.36), warm);
  totalEmissiveRadiance += lamp * facadeWindow * on * uWindowGlow * 2.3;
}`).replace("#include <opaque_fragment>",`if (uEnvStrength > 0.0) {
  vec3 viewDir = normalize(vFacadeWorld - cameraPosition);
  vec3 n = normalize(vFacadeNormal);
  vec3 reflected = reflect(viewDir, n);
  // 反射向下看到的是地面/邻楼（环境图里没有）：压暗而不是映天空。
  float skyward = smoothstep(-0.15, 0.25, reflected.y);
  float fresnel = 0.06 + 0.94 * pow(1.0 - max(dot(-viewDir, n), 0.0), 4.0);
  // 俯视时反射多朝下（映地面），只轻压：压太狠玻璃发黑，航拍视角下大部分时间都是这个角度。
  vec3 reflection = facadeSky(reflected) * mix(0.68, 1.0, skyward);
  outgoingLight = mix(outgoingLight, reflection, clamp(facadeWindow * uEnvStrength * (0.35 + 0.65 * fresnel), 0.0, 0.92));
}
#include <opaque_fragment>`)},n.customProgramCacheKey=()=>`city-facade-${e}`,n}function nd(r){const t=[0];let e=0;for(let n=1;n<r.length;n+=1)e+=Math.hypot(r[n].x-r[n-1].x,r[n].z-r[n-1].z),t.push(e);return{cumulative:t,total:e}}function id(r,t){const e=(t%r.total+r.total)%r.total;let n=1;for(;n<r.cumulative.length-1&&r.cumulative[n]<e;)n+=1;const i=r.points[n-1],s=r.points[n],a=r.cumulative[n]-r.cumulative[n-1]||1,o=(e-r.cumulative[n-1])/a;return{x:i.x+(s.x-i.x)*o,z:i.z+(s.z-i.z)*o,dx:(s.x-i.x)/a,dz:(s.z-i.z)/a}}const Hc=new WeakMap,Gc=new WeakMap;function sd(r){return Gc.has(r)||Gc.set(r,r.speed),Gc.get(r)}function Ii(r,t){return Hc.has(r)||Hc.set(r,t),Hc.get(r)}function $y(r,t,e){const n=r/1.39,i=t/n,s=[new ft(0*n,.88*n),new ft(.06*n,.88*n),new ft(.09*n,.94*n),new ft(.12*n,.98*n),new ft(.18*n,1*n),new ft(.24*n,.98*n)],a=24;for(let u=1;u<=a;u+=1){const f=u/a;s.push(new ft(.24*n+Math.pow(f,1.6)*1.15*n,(1-f)*.98*n))}const o=new tc(s.reverse(),32),l=o.attributes.position,c=(u,f,m,_)=>(Fs(u+m*.71,f+m*1.37,e+77,_)+Fs(m+f*.53,u-f*.91,e+131,_))*.25+.5,h=n;for(let u=0;u<l.count;u+=1){const f=l.getX(u),m=l.getY(u),_=l.getZ(u);if(Math.hypot(f,_)<.001){l.setY(u,m*i);continue}const g=m/h,v=(c(f/n*4,m/n*4,_/n*4,4)-.5)*2,M=Math.sin(g*Math.PI),x=1+v*.25*Math.max(M,(1-g)*.6);l.setX(u,f*x),l.setZ(u,_*x),l.setY(u,(m+v*.08*n*M)*i)}const d=new Float32Array(l.count*3);for(let u=0;u<l.count;u+=1){const f=l.getX(u),m=l.getY(u)/i,_=l.getZ(u),p=Math.hypot(f,_),g=Math.max(0,m/h),v=c(f/n*10,m/n*10,_/n*10,3),M=Math.max(0,Math.min(1,g+(v-.5)*.25));let x;if(M>.88&&p<.1*n)x=[.85,.25,.05];else if(M>.82)x=[.16,.1,.08];else if(M>.55){const S=(M-.55)/.27;x=[.38+(.16-.38)*S,.24+(.1-.24)*S,.18+(.08-.18)*S]}else{const S=Math.min(1,M/.55);x=[.28+.1*S,.32-.08*S,.22-.04*S]}const b=(v-.5)*.1;d[u*3]=Math.max(0,Math.min(1,x[0]+b)),d[u*3+1]=Math.max(0,Math.min(1,x[1]+b)),d[u*3+2]=Math.max(0,Math.min(1,x[2]+b))}return o.setAttribute("color",new Pe(d,3)),o.computeVertexNormals(),o}let dn=null;class Ky{constructor(t,e,n=null){F(this,"group",new ze);F(this,"raycastTargets",[]);F(this,"water");F(this,"runtimes",[]);F(this,"runtimeById",new Map);F(this,"shaftMeshes",[]);F(this,"zoneById",new Map);F(this,"shaftIdByInstance",[]);F(this,"disposables",[]);F(this,"podiumMesh");F(this,"roofMesh");F(this,"facadeUniforms",[]);F(this,"decoTrimMesh");F(this,"roofProfiles",[]);F(this,"gardenTreeMesh");F(this,"civicPieces",[]);F(this,"civicMeshes",[]);F(this,"civicProgress",[]);F(this,"civicTarget",[]);F(this,"heroParts",null);F(this,"decoCornerMesh");F(this,"nightLights",null);F(this,"terrainUniforms",null);F(this,"flagTime",null);F(this,"waterAssetUniforms",null);F(this,"neonMesh");F(this,"scaffoldMesh");F(this,"antennaMesh");F(this,"beaconMesh");F(this,"craneMastMesh");F(this,"craneArmMesh");F(this,"treeMesh");F(this,"floraMeshes",[]);F(this,"landmarkSpinners",[]);F(this,"carMesh");F(this,"carKeep",1);F(this,"boatMesh");F(this,"wakeMesh");F(this,"wakes");F(this,"cloudMesh");F(this,"anomalyMarkers",[]);F(this,"labels",[]);F(this,"hoverRing");F(this,"selectRing");F(this,"cars");F(this,"boats");F(this,"clouds");F(this,"waterUniforms");F(this,"matrix",new It);F(this,"quaternion",new He);F(this,"euler",new Tn);F(this,"scaleVector",new L);F(this,"positionVector",new L);F(this,"color",new pt);F(this,"cursor",Number.NaN);F(this,"live",!0);F(this,"labelsVisible",!0);F(this,"previousDisplays",null);F(this,"hoveredId",null);F(this,"selectedId",null);F(this,"nightGlow",0);this.model=t,this.layout=e,this.previousDisplays=n;const i=t.buildings.length;let s=dn&&dn.seed===e.seed&&dn.layout.scaleTier===e.scaleTier&&dn.layout.highways===e.highways&&JSON.stringify([dn.layout.civics,dn.layout.gardens])===JSON.stringify([e.civics,e.gardens])?dn:null;if(!s){dn==null||dn.disposables.forEach(g=>g.dispose());const f=[];this.disposables=f,this.buildTerrain(),this.buildInfrastructure(),this.buildDistrictExpressways(),this.nightLights=this.buildNightLights(),this.buildPublicSites(),this.buildCivics(),this.buildLandmarks(),this.buildSeaMountains(),this.treeMesh=this.buildTrees();const m=this.buildCars();this.carMesh=m.mesh;const _=this.buildBoats();this.boatMesh=_.mesh,this.wakeMesh=_.wakeMesh,this.wakes=_.wakes;const p=this.buildClouds();this.cloudMesh=p.mesh,this.water=this.buildWater(),this.buildGardens(),this.buildFlags(),s={seed:e.seed,layout:e,group:this.group,disposables:f,water:this.water,treeMesh:this.treeMesh,carMesh:this.carMesh,cars:m.cars,boatMesh:this.boatMesh,boats:_.boats,wakeMesh:this.wakeMesh,wakes:_.wakes,cloudMesh:this.cloudMesh,clouds:p.clouds,terrainUniforms:this.terrainUniforms,flagTime:this.flagTime,waterAssetUniforms:this.waterAssetUniforms,landmarkSpinners:this.landmarkSpinners,nightLights:this.nightLights},dn=s,this.group=new ze,this.disposables=[]}this.group.add(s.group),this.water=s.water,this.treeMesh=s.treeMesh,this.carMesh=s.carMesh,this.boatMesh=s.boatMesh,this.cloudMesh=s.cloudMesh,this.cars=s.cars,this.boats=s.boats,this.clouds=s.clouds,this.wakeMesh=s.wakeMesh,this.wakes=s.wakes,this.terrainUniforms=s.terrainUniforms,this.flagTime=s.flagTime,this.waterAssetUniforms=s.waterAssetUniforms,this.landmarkSpinners=s.landmarkSpinners,this.nightLights=s.nightLights,this.captureAnimationOrigin(),this.waterUniforms=this.water.material.uniforms;const a=[Oc(0,11),Oc(1,37),Oc(2,71),Hy()];a.forEach(f=>{f.colorSpace=Fe,this.disposables.push(f)});const o=new Map;for(const f of this.layout.districts)for(const[m,_]of f.slots)o.set(m,_.zone);this.zoneById=o;const l=[0,0,0,0];for(const f of t.buildings)o.has(f.id)&&(l[this.facadeFor(f)]+=f.archetype==="tower"||f.archetype==="landmark"?2:1);a.forEach((f,m)=>{const _=l[m]+8,p=Ye.clone();p.setAttribute("aFloors",new Vi(new Float32Array(_),1));const g={uRows:{value:m===3?2:4},uPhoto:{value:0},uPhotoTex:{value:null},uPhotoRows:{value:1},uTileWidth:{value:1},uSelfLit:{value:.24},uWindowGlow:{value:0},uGrid:{value:new ft(...qy[m]??[4,4])},uEnv:{value:null},uEnvStrength:{value:0},uGradeTop:{value:new pt(ce().skyGrade.top)},uGradeHorizon:{value:new pt(ce().skyGrade.horizon)},uGradeAmount:{value:ce().skyGrade.amount},uSkyYaw:{value:Sc(ce())}};this.facadeUniforms.push(g);const v=new De(p,Zy(f,g,String(m)),_);v.instanceMatrix.setUsage(Si),v.castShadow=!0,v.receiveShadow=!0,v.count=0,v.frustumCulled=!1,v.name=`city-shafts-${m}`,this.shaftMeshes.push(v),this.shaftIdByInstance.push(new Map),this.group.add(v),this.raycastTargets.push(v),this.disposables.push(p,v.material)});const c=Ye.clone();{const f=c.getAttribute("position");for(let m=0;m<f.count;m+=1)f.getY(m)>.99&&f.setX(m,0);c.computeVertexNormals()}const h=new Rn(.5,1,4,1).rotateY(Math.PI/4).translate(0,.5,0);[c,h,Ye,Ye].forEach((f,m)=>{const _=this.makeInstanced(f,ro(.18),i);_.castShadow=!0,_.name=`city-roof-profile-${m+1}`,this.roofProfiles.push(_)}),this.gardenTreeMesh=this.makeInstanced(new Cr(1,0).translate(0,1,0),new ie({color:ce().foliage}),i*3),this.gardenTreeMesh.castShadow=!0;const u=l[3]+4;this.decoTrimMesh=this.makeInstanced(Ye,ro(.24),u*2),this.decoCornerMesh=this.makeInstanced(kc,ro(.24),u),this.podiumMesh=this.makeInstanced(Ye,new ie({color:"#e8e2d5"}),i),this.roofMesh=this.makeInstanced(Ye,new ie({color:"#ffffff"}),i),this.neonMesh=this.makeInstanced(Ye,new Te({color:"#ffffff",toneMapped:!1}),i),this.neonMesh.castShadow=!1,this.scaffoldMesh=this.makeInstanced(Ye,new ie({color:"#e0a83f",transparent:!0,opacity:.24,depthWrite:!1}),i),this.scaffoldMesh.castShadow=!1,this.antennaMesh=this.makeInstanced(new je(.09,.16,1,5).translate(0,.5,0),new ie({color:"#5d6470"}),96),this.beaconMesh=this.makeInstanced(new yn(.32,8,6),new Te({color:"#ffb02e"}),96),this.craneMastMesh=this.makeInstanced(new ae(.85,1,.85).translate(0,.5,0),new ie({color:"#ffb400",emissive:"#6b4300"}),48),this.craneArmMesh=this.makeInstanced(new ae(1,.32,.32),new ie({color:"#ffb400",emissive:"#6b4300"}),48),this.buildMassing(),this.buildAnomalyMarkers(),this.hoverRing=this.makeGroundRing("#087f62"),this.selectRing=this.makeGroundRing("#c96f4a"),this.buildRuntimes(),this.buildLabels()}makeInstanced(t,e,n){const i=new De(t,e,Math.max(n,1));return i.instanceMatrix.setUsage(Si),i.count=0,i.frustumCulled=!1,this.group.add(i),this.disposables.push(t,e),i}makeGroundRing(t){const e=new Rr(.86,1,40).rotateX(-Math.PI/2),n=new Te({color:t,transparent:!0,opacity:.85,depthWrite:!1}),i=new Xt(e,n);return i.visible=!1,i.renderOrder=3,this.group.add(i),this.disposables.push(e,n),i}buildTerrain(){{const t=this.layout.extent,e=192,n=new Vn(t,t,e,e).rotateX(-Math.PI/2),i=n.attributes.position;for(let l=0;l<i.count;l+=1){const c=i.getX(l),h=i.getZ(l);i.setXYZ(l,c,this.layout.terrain.height(c,h),h)}n.computeVertexNormals();const s=Gy(this.layout);s.colorSpace=Fe;const a=new ie({map:s});this.installGroundDetail(a);const o=new Xt(n,a);o.receiveShadow=!0,this.group.add(o),this.disposables.push(n,a,s)}}installGroundDetail(t){const e={uDetail:{value:0}};for(const n of["Asphalt","Concrete","Sand","Mud","Grass"])e[`u${n}C`]={value:null},e[`u${n}N`]={value:null},e[`u${n}Mean`]={value:new L(.5,.5,.5)};this.terrainUniforms=e,t.onBeforeCompile=n=>{Object.assign(n.uniforms,e),n.vertexShader=n.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vCityWorld;`).replace("#include <project_vertex>",`#include <project_vertex>
vCityWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);const i=["Asphalt","Concrete","Sand","Mud","Grass"].map(s=>`uniform sampler2D u${s}C; uniform sampler2D u${s}N; uniform vec3 u${s}Mean;`).join(`
`);n.fragmentShader=n.fragmentShader.replace("#include <common>",`#include <common>
varying vec3 vCityWorld;
uniform float uDetail;
${i}`).replace("#include <map_fragment>",`#include <map_fragment>
#ifdef USE_MAP
  if (uDetail > 0.5) {
    vec3 base = diffuseColor.rgb;
    float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
    float mx = max(base.r, max(base.g, base.b));
    float sat = (mx - min(base.r, min(base.g, base.b))) / max(mx, 1e-3);
    float wA = (1.0 - smoothstep(0.12, 0.3, sat)) * (1.0 - smoothstep(0.05, 0.14, lum));
    float wC = (1.0 - smoothstep(0.08, 0.22, sat)) * smoothstep(0.16, 0.36, lum);
    float wG = smoothstep(0.005, 0.05, base.g - max(base.r, base.b));
    float wS = smoothstep(0.02, 0.09, base.r - base.b) * smoothstep(0.18, 0.4, lum) * (1.0 - wG);
    float wet = 1.0 - smoothstep(0.5, 1.9, vCityWorld.y);
    float wM = wS * wet;
    wS *= 1.0 - wet;
    float sum = wA + wC + wG + wS + wM;
    float strength = smoothstep(0.05, 0.45, sum);
    sum += 1e-4;
    vec2 p = vCityWorld.xz;
    vec3 ratio = (wA * texture2D(uAsphaltC, p / 7.0).rgb / uAsphaltMean
      + wC * texture2D(uConcreteC, p / 5.5).rgb / uConcreteMean
      + wS * texture2D(uSandC, p / 13.0).rgb / uSandMean
      + wM * texture2D(uMudC, p / 9.0).rgb / uMudMean
      + wG * mix(vec3(1.0), texture2D(uGrassC, p / 34.0).rgb / uGrassMean, 0.45)) / sum;
    vec3 nrm = (wA * (texture2D(uAsphaltN, p / 7.0).xyz * 2.0 - 1.0)
      + wC * (texture2D(uConcreteN, p / 5.5).xyz * 2.0 - 1.0)
      + wS * (texture2D(uSandN, p / 13.0).xyz * 2.0 - 1.0)
      + wM * (texture2D(uMudN, p / 9.0).xyz * 2.0 - 1.0)
      + wG * 0.4 * (texture2D(uGrassN, p / 34.0).xyz * 2.0 - 1.0)) / sum;
    diffuseColor.rgb *= mix(vec3(1.0), clamp(ratio, 0.35, 1.8), 0.8 * strength);
    // 法线贴图做「固定光向」的明暗起伏：地面近似水平，省掉切线空间，代价是凹凸不随太阳转。
    diffuseColor.rgb *= 1.0 + 0.55 * strength * (nrm.x * 0.6 - nrm.y * 0.45);
    // 滩涂：向泥色偏、压暗，像刚退潮的湿岸。
    vec3 mud = texture2D(uMudC, p / 9.0).rgb;
    diffuseColor.rgb = mix(diffuseColor.rgb, mud * 0.9, 0.5 * wM / sum * strength);
  }
#endif`)},t.customProgramCacheKey=()=>"city-terrain-detail"}setMirror(t,e){this.waterAssetUniforms&&(this.waterAssetUniforms.uMirror.value=t,this.waterAssetUniforms.uHasMirror.value=t?1:0,e&&this.waterAssetUniforms.uMirrorMatrix.value.copy(e))}setNightWater(t){this.waterAssetUniforms&&(this.waterAssetUniforms.uNight.value=t)}setSkyMix(t){const e=ce().skyGrade.amount*(1-t);this.waterAssetUniforms&&(this.waterAssetUniforms.uGradeAmount.value=e);for(const n of this.facadeUniforms)n.uGradeAmount.value=e}applyAssets(t){var l;const e=c=>{const h=c.image,d=Os();d.width=d.height=8;const u=d.getContext("2d");if(!u)return new L(.5,.5,.5);u.drawImage(h,0,0,8,8);const f=u.getImageData(0,0,8,8).data,m=[0,0,0];for(let p=0;p<f.length;p+=4)for(let g=0;g<3;g+=1)m[g]+=f[p+g];const _=p=>Math.pow(p/255/64,2.2);return new L(_(m[0]),_(m[1]),_(m[2]))};if(this.terrainUniforms){const c=t.ground,h=[["Asphalt",c.asphalt],["Concrete",c.concrete],["Sand",c.sand],["Mud",c.mud],["Grass",c.grass]];for(const[d,u]of h)this.terrainUniforms[`u${d}C`].value=u.color,this.terrainUniforms[`u${d}N`].value=u.normal,this.terrainUniforms[`u${d}Mean`].value=e(u.color);this.terrainUniforms.uDetail.value=1}const n=[8,10,10],i=[30,32,32];t.facades.forEach((c,h)=>{const d=this.facadeUniforms[h];d&&(d.uPhotoTex.value=c,d.uPhoto.value=1,d.uPhotoRows.value=n[h],d.uTileWidth.value=i[h])});const s=[.3,.7,.9,.3],a=t.sky.day;this.facadeUniforms.forEach((c,h)=>{c.uEnv.value=a,c.uEnvStrength.value=s[h]??0});const o=(l=this.shaftMeshes[3])==null?void 0:l.material;o&&(o.normalMap=t.stuccoNormal,o.normalScale.set(.6,.6),o.needsUpdate=!0),this.waterAssetUniforms&&(this.waterAssetUniforms.uNormal.value=t.waterNormal,this.waterAssetUniforms.uSkyTex.value=t.sky.day,this.waterAssetUniforms.uHasAssets.value=1)}buildInfrastructure(){const t=[],e=(i,s,a,o,l,c,h,d=0,u=0)=>t.push({x:i,y:s,z:a,sx:o,sy:l,sz:c,color:h,tilt:d,yaw:u});for(const i of this.layout.roadEdges){if(i.bridge){const[_,p]=i.points,g=Math.hypot(p.x-_.x,p.z-_.z),v=-Math.atan2(p.z-_.z,p.x-_.x),M=(_.x+p.x)/2,x=(_.z+p.z)/2,b=Math.max(this.layout.terrain.height(_.x,_.z),this.layout.terrain.height(p.x,p.z));e(M,b-.4,x,g+.5,.4,i.width,"#6a7071",0,v);for(const S of[-1,1]){const T=S*(i.width/2-.15);e(M+Math.sin(v)*T,b,x+Math.cos(v)*T,g,.65,.3,"#b9bcb2",0,v)}for(let S=16;S<g-12;S+=32){const T=S/g,y=_.x+(p.x-_.x)*T,A=_.z+(p.z-_.z)*T,E=this.layout.terrain.height(y,A);e(y,E,A,1.6,Math.max(.1,b-.35-E),i.width-.6,"#a9aaa0",0,v)}continue}const[s,a]=i.points,o=Math.hypot(a.x-s.x,a.z-s.z);if(o<14)continue;const l=o-11,c=-Math.atan2(a.z-s.z,a.x-s.x),h=-(a.z-s.z)/o,d=(a.x-s.x)/o,u=(s.x+a.x)/2,f=(s.z+a.z)/2,m=Math.max(0,this.layout.terrain.height(u,f));for(const _ of[-1,1]){const p=_*(i.width/2+.25);e(u+h*p,m+.02,f+d*p,l,.18,.35,"#cbc6ba",0,c)}}const n=this.makeInstanced(Ye,new ie({color:"#ffffff"}),t.length);t.forEach((i,s)=>{this.positionVector.set(i.x,i.y,i.z),this.euler.set(i.tilt??0,i.yaw??0,0),this.quaternion.setFromEuler(this.euler),this.scaleVector.set(i.sx,i.sy,i.sz),this.matrix.compose(this.positionVector,this.quaternion,this.scaleVector),n.setMatrixAt(s,this.matrix),n.setColorAt(s,this.color.set(i.color))}),n.instanceMatrix.needsUpdate=!0,n.instanceColor&&(n.instanceColor.needsUpdate=!0),n.count=t.length,n.name="city-infrastructure-decorative"}buildDistrictExpressways(){const t=[];for(const i of this.layout.highways??[]){const s=Vc(i,(l,c)=>this.layout.terrain.height(l,c));let a=0,o=0;for(let l=0;l<i.length;l+=1){const c=i[l];if(l>0&&(a+=Math.hypot(c.x-i[l-1].x,c.z-i[l-1].z)),a>=o){o=a+34;const h=Math.max(-3,this.layout.terrain.height(c.x,c.z)),d=s[l]+.05;if(d-h<1.5)continue;const u=i[Math.min(l+1,i.length-1)],f=i[Math.max(l-1,0)],m=-Math.atan2(u.z-f.z,u.x-f.x);t.push({x:c.x,y:h,z:c.z,sx:1.8,sy:d-h,sz:8.4,yaw:m,color:"#a9aaa0"})}}for(let l=1;l<i.length;l+=1){const c=i[l-1],h=i[l],d=Math.hypot(h.x-c.x,h.z-c.z);if(d<6)continue;const u=-Math.atan2(h.z-c.z,h.x-c.x),f=(c.x+h.x)/2,m=(c.z+h.z)/2,_=s[l-1],p=s[l],g=(_+p)/2,v=Math.atan2(p-_,d),M=Math.hypot(d,p-_),x=g+Vr;t.push({x:f,y:g,z:m,sx:M+.5,sy:Vr,sz:ed,yaw:u,pitch:v,color:"#6a7071"});const b=Math.sin(u),S=Math.cos(u);for(const T of[-3.6,0,3.6])t.push({x:f+b*T,y:x,z:m+S*T,sx:M,sy:.05,sz:.3,yaw:u,pitch:v,color:"#c6c6bb"});for(const T of[-5.1,5.1])t.push({x:f+b*T,y:x,z:m+S*T,sx:M,sy:.55,sz:.3,yaw:u,pitch:v,color:"#b9bcb2"})}}if(!t.length)return;const e=Ye.clone(),n=new De(e,new ie({color:"#ffffff"}),t.length);n.castShadow=!0,n.receiveShadow=!0,t.forEach((i,s)=>{this.positionVector.set(i.x,i.y,i.z),this.euler.set(0,i.yaw,i.pitch??0,"YZX"),this.quaternion.setFromEuler(this.euler),this.euler.set(0,0,0,"XYZ"),this.scaleVector.set(i.sx,i.sy,i.sz),this.matrix.compose(this.positionVector,this.quaternion,this.scaleVector),n.setMatrixAt(s,this.matrix),n.setColorAt(s,this.color.set(i.color))}),n.instanceMatrix.needsUpdate=!0,n.instanceColor&&(n.instanceColor.needsUpdate=!0),n.name="city-district-expressways",this.group.add(n),this.disposables.push(e,n.material)}buildPublicSites(){var a;const t=[],e=[],n=[];for(const o of this.layout.publicSites){if(o.kind==="park")continue;const l=o.radius,c=Math.max(0,this.layout.terrain.height(o.x,o.z)),h=Math.cos(o.yaw),d=Math.sin(o.yaw),u=(p,g)=>({x:o.x+p*h+g*d,z:o.z-p*d+g*h}),f=(p,g,v,M,x,b,S,T=0)=>{const y=u(p,v);t.push({x:y.x,y:c+g,z:y.z,sx:M,sy:x,sz:b,yaw:o.yaw+T,color:S})},m=(p,g,v,M,x,b)=>{const S=u(p,v);e.push({x:S.x,y:c+g,z:S.z,sx:M,sy:x,sz:M,yaw:0,color:b})},_=(p,g,v,M,x,b,S,T=0)=>{const y=u(p,v);n.push({x:y.x,y:c+g,z:y.z,sx:M,sy:x,sz:b,yaw:o.yaw+T,color:S})};if(o.kind==="civic"){f(0,0,0,l*1.2,1.6,l*.9,"#e4dcc8"),f(0,1.6,0,l*.9,9,l*.55,"#efe7d6");for(let p=-3;p<=3;p+=1)m(p*l*.12,1.6,l*.34,.75,9,"#f6f0e2");f(0,10.6,0,l*.98,1.1,l*.62,"#cdbf9f"),m(0,11.7,0,l*.27,4.2,"#d6c9a8"),m(0,15.9,0,l*.2,3.4,"#5fa7a3"),m(0,19.3,0,.4,6,"#c9b98f");for(const p of[-1,1])_(0,11.7,p*l*.31,l*.98,.22,.22,"#ffe2a8");for(const p of[-1,1])_(p*l*.49,11.7,0,.22,.22,l*.62,"#ffe2a8");_(0,1.7,l*.46,l*1.2,.2,.2,"#ffd08a"),_(0,17.4,0,l*.41,.25,l*.41,"#46e6ff"),_(0,25.6,0,.6,.9,.6,"#ff5a7a")}else if(o.kind==="station"){f(0,0,0,l*1.5,.7,l*1.1,"#cfc7b3");for(const p of[-18,-10,-2,6])f(p,.7,0,.5,.15,l*1.1,"#6f7773");f(0,7.4,0,l*1.4,.55,l*.9,"#8e9a9c");for(const p of[-l*.6,0,l*.6])for(const g of[-l*.38,l*.38])m(p,.7,g,.55,6.7,"#a9b0b0");f(0,0,-l*.62,l*1.3,11,7,"#d9cdb5"),m(l*.5,11,-l*.62,1.6,10,"#c8bba0"),m(l*.5,21,-l*.62,2.1,1.2,"#f4efe0"),_(l*.5,21.15,-l*.62,1.7,.9,1.7,"#fff3cf");for(const p of[-1,1])_(0,7.5,p*l*.45,l*1.4,.22,.22,"#58e0ff");_(0,11,-l*.62+3.6,l*1.3,.22,.22,"#ffd08a")}else if(o.kind==="stadium"){for(let g=0;g<18;g+=1){const v=g/18*Math.PI*2,M=Math.cos(v)*27,x=Math.sin(v)*19.5,b=Math.atan2(19.5*Math.cos(v),-27*Math.sin(v));f(M,0,x,10.5,g%4===0?11:8,5.5,g%4===0?"#c05a4f":"#dcd8ca",-b)}for(const[g,v]of[[-30,-22],[30,-22],[-30,22],[30,22]])m(g,0,v,.55,24,"#9aa0a0"),_(g,24,v,4,1.4,2.4,"#fff3c4");for(let g=0;g<18;g+=1){const v=g/18*Math.PI*2,M=Math.atan2(19.5*Math.cos(v),-27*Math.sin(v));_(Math.cos(v)*27,g%4===0?11.1:8.1,Math.sin(v)*19.5,10.5,.22,.22,g%2===0?"#38e8ff":"#ff4fd8",-M)}}else if(o.kind==="tower")m(0,0,0,6.5,3.2,"#c4c7c6"),m(0,3.2,0,2.3,42,"#cfd3d6"),m(0,42,0,6.4,3.8,"#eaf0f2"),m(0,45.8,0,4.2,2.2,"#7fb4c2"),m(0,48,0,.45,15,"#d45a4a"),_(0,45.2,0,4.4,.35,4.4,"#46e6ff"),_(0,41.6,0,6.6,.3,6.6,"#ff4fd8"),_(0,20,0,2.5,.35,2.5,"#ffd08a"),_(0,62.6,0,1.1,1.3,1.1,"#ff3b3b");else if(o.kind==="harbor"){f(0,0,0,l*1.5,.5,l*1.2,"#8e9490"),f(0,.5,-l*.5,l*1.1,6.5,10,"#bab4a3");const p=["#a9684f","#4f7f8a","#c9a24a","#6a8a62","#8a5a7a","#d8d2c0"];for(let g=0;g<5;g+=1)for(let v=0;v<3;v+=1){const M=1+Math.floor(Ft(`ctn:${o.id}:${g}:${v}`)*3);for(let x=0;x<M;x+=1)f(-l*.55+g*7,.5+x*2.7,-l*.1+v*4.4,6.2,2.6,3.8,p[Math.floor(Ft(`ctc:${o.id}:${g}:${v}:${x}`)*p.length)])}for(const[g,v]of[[-l*.65,l*.38],[-l*.65,l*.62],[l*.15,l*.38],[l*.15,l*.62]])m(g,.5,v,.6,17,"#c9532f");f(-l*.25,17.5,l*.5,l*1.1,1.3,1.5,"#c9532f"),f(-l*.25+l*.55,17.2,l*.5,14,1,1,"#d9d3c2",0),_(0,.55,l*.6,l*1.5,.25,.25,"#ffb366"),_(0,.55,-l*.6,l*1.5,.25,.25,"#ffb366");for(const[g,v]of[[-l*.65,l*.38],[-l*.65,l*.62],[l*.15,l*.38],[l*.15,l*.62]])_(g,17.6,v,1.4,.7,1.4,"#fff1c4");_(-l*.25+l*.55+7,17.2,l*.5,.9,.9,.9,"#ff3b3b");for(const g of[-l*.6,0,l*.6])m(g,.5,-l*.2,.18,12,"#8a9096"),_(g,12.5,-l*.2,1.6,.5,1.6,"#fff1c4")}}if(!t.length)return;const i=(o,l,c)=>{if(!l.length)return;const h=new ie({color:"#ffffff"}),d=new De(o.clone(),h,l.length);d.castShadow=!0,d.receiveShadow=!0,l.forEach((u,f)=>{this.positionVector.set(u.x,u.y,u.z),this.euler.set(0,u.yaw,0),this.quaternion.setFromEuler(this.euler),this.scaleVector.set(u.sx,u.sy,u.sz),this.matrix.compose(this.positionVector,this.quaternion,this.scaleVector),d.setMatrixAt(f,this.matrix),d.setColorAt(f,this.color.set(u.color))}),d.instanceMatrix.needsUpdate=!0,d.instanceColor&&(d.instanceColor.needsUpdate=!0),d.name=c,this.group.add(d),this.disposables.push(d.geometry,h)};i(Ye,t,"city-public-sites-boxes"),i(kc,e,"city-public-sites-cylinders");const s=(a=this.nightLights)==null?void 0:a.neon;if(s&&n.length){const o=new De(Ye.clone(),s,n.length);n.forEach((l,c)=>{this.positionVector.set(l.x,l.y,l.z),this.euler.set(0,l.yaw,0),this.quaternion.setFromEuler(this.euler),this.scaleVector.set(l.sx,l.sy,l.sz),this.matrix.compose(this.positionVector,this.quaternion,this.scaleVector),o.setMatrixAt(c,this.matrix),o.setColorAt(c,this.color.set(l.color))}),o.instanceMatrix.needsUpdate=!0,o.instanceColor&&(o.instanceColor.needsUpdate=!0),o.frustumCulled=!1,o.name="city-public-sites-glow",this.group.add(o),this.disposables.push(o.geometry)}}buildFlags(){const t=[];for(const u of this.layout.gardens??[]){const f=Math.cos(u.yaw),m=Math.sin(u.yaw);t.push({x:u.x+f*u.width*.3-m*u.depth*.32,z:u.z+m*u.width*.3+f*u.depth*.32,y:u.y,yaw:u.yaw,pole:7.5,cloth:1,color:kr(u.districtId).accent})}const e=this.layout.publicSites.find(u=>u.kind==="tower");if(e&&t.push({x:e.x,z:e.z,y:this.layout.terrain.height(e.x,e.z),yaw:e.yaw,pole:15,cloth:1.5,color:"#f2efe6"}),!t.length)return;this.flagTime={value:0};const n=new je(.12,.17,1,6).translate(0,.5,0),i=new ie({color:"#8a9096"}),s=this.makeInstanced(n,i,t.length),a=5.2,o=new Vn(a,3.1,10,5).translate(a/2+.1,-1.7,0),l=new Float32Array(t.map((u,f)=>Ft(`flag:${f}`)*Math.PI*2));o.setAttribute("aPhase",new Vi(l,1));const c=new ie({side:qe}),h=this.flagTime;c.onBeforeCompile=u=>{u.uniforms.uTime=h,u.vertexShader=u.vertexShader.replace("#include <common>",`#include <common>
attribute float aPhase;
uniform float uTime;`).replace("#include <begin_vertex>",`#include <begin_vertex>
          float hoist = smoothstep(0.0, ${a.toFixed(1)}, position.x);
          transformed.z += (sin(uTime * 2.7 + aPhase + position.x * 1.1) * 0.4 + sin(uTime * 5.2 + aPhase * 1.7 + position.x * 2.4) * 0.13) * hoist;
          transformed.y -= hoist * hoist * 0.2;`)},c.customProgramCacheKey=()=>"city-flag-cloth";const d=new De(o,c,t.length);d.name="city-flags",t.forEach((u,f)=>{this.compose(u.x,u.y,u.z,u.yaw,.8,u.pole,.8),s.setMatrixAt(f,this.matrix),this.compose(u.x,u.y+u.pole-.15,u.z,u.yaw,u.cloth,u.cloth,1),d.setMatrixAt(f,this.matrix),d.setColorAt(f,this.color.set(u.color))}),d.instanceColor&&(d.instanceColor.needsUpdate=!0),this.group.add(s,d),this.disposables.push(n,i,o,c)}buildGardens(){const t=this.layout.gardens??[];if(!t.length)return;const e=[],n=[],i=[],s=[],a=this.water.material;for(const l of t){const c=l.seed,h=Math.max(.3,l.y),d=Math.cos(l.yaw),u=Math.sin(l.yaw),f=(E,P)=>({x:l.x+E*d+P*u,z:l.z-E*u+P*d}),m=l.width-3,_=l.depth-3,p=f(0,0);e.push({x:p.x,y:h,z:p.z,sx:m,sy:.25,sz:_,yaw:l.yaw,tilt:0,color:"#7fae6a"});const g=-m*.08,v=_*.04,M=m*.32,x=_*.3,b=f(g,v),S=new Xt(new _r(1,40).rotateX(-Math.PI/2),a);S.position.set(b.x,h+.3,b.z),S.rotation.y=l.yaw,S.scale.set(M,1,x),S.renderOrder=1,this.group.add(S),this.disposables.push(S.geometry);for(let E=0;E<22;E+=1){const P=E/22*Math.PI*2,D=Ft(`${l.id}:bank:${E}`),N=f(g+Math.cos(P)*(M+.6),v+Math.sin(P)*(x+.6)),R=.9+D*.9;n.push({x:N.x,y:h+.2,z:N.z,sx:R*1.3,sy:R*.55,sz:R,yaw:D*6.28,tilt:0,color:D>.5?"#a8a59c":"#8f8c84"})}const T=f(g+M*.35,v-x*.25);for(let E=0;E<7;E+=1){const P=Ft(`${l.id}:rock:${E}`),D=E<3?0:E<5?1:E<6?2:3,N=(3.2-D*.7)*(.8+P*.4),R=(P-.5)*2.4;n.push({x:T.x+R,y:h+.1+D*2.1,z:T.z+(Ft(`${l.id}:rz:${E}`)-.5)*2.4,sx:N,sy:N*(1.1+P*.5),sz:N*.85,yaw:P*6.28,tilt:(P-.5)*.4,color:["#9b978c","#b3afa4","#86837b"][E%3]})}const y=f(m*.34,-_*.18),A=new pt(kr(l.districtId).accent).lerp(new pt("#5a3b2c"),.35).getStyle();e.push({x:y.x,y:h+.25,z:y.z,sx:5.4,sy:.5,sz:5.4,yaw:l.yaw,tilt:0,color:"#d8d1c2"});for(const[E,P]of[[-2,-2],[2,-2],[-2,2],[2,2]]){const D=f(m*.34+E,-_*.18+P);e.push({x:D.x,y:h+.75,z:D.z,sx:.35,sy:3.4,sz:.35,yaw:l.yaw,tilt:0,color:"#8a3b2e"})}i.push({x:y.x,y:h+4.1,z:y.z,sx:4.4,sy:2.6,sz:4.4,yaw:l.yaw+Math.PI/4,tilt:0,color:A});for(let E=0;E<14;E+=1){const P=E/14*Math.PI*2+c,D=f(Math.cos(P)*m*.44,Math.sin(P)*_*.42),N=1.4+Ft(`${l.id}:tree:${E}`)*.9;s.push({x:D.x,y:h+.2,z:D.z,sx:N,sy:N*1.2,sz:N,yaw:0,tilt:0,color:E%3===0?"#5f9a55":"#6fae63"})}}const o=(l,c,h)=>{if(!c.length)return;const d=new ie({color:"#ffffff",flatShading:!0}),u=new De(l,d,c.length);u.castShadow=!0,u.receiveShadow=!0,c.forEach((f,m)=>{this.positionVector.set(f.x,f.y,f.z),this.euler.set(f.tilt,f.yaw,0),this.quaternion.setFromEuler(this.euler),this.scaleVector.set(f.sx,f.sy,f.sz),this.matrix.compose(this.positionVector,this.quaternion,this.scaleVector),u.setMatrixAt(m,this.matrix),u.setColorAt(m,this.color.set(f.color))}),u.instanceMatrix.needsUpdate=!0,u.instanceColor&&(u.instanceColor.needsUpdate=!0),u.name=h,this.group.add(u),this.disposables.push(l,d)};o(Ye.clone(),e,"city-garden-boxes"),o(new Da(.6,0).translate(0,.45,0),n,"city-garden-rocks"),o(new Rn(.5,1,4).translate(0,.5,0),i,"city-garden-roofs"),o(new Cr(1,0).translate(0,1.4,0),s,"city-garden-trees")}buildNightLights(){const t=new Te({color:"#ffc773",toneMapped:!1}),e=Os();e.width=e.height=64;const n=e.getContext("2d");if(n){const p=n.createRadialGradient(32,32,0,32,32,32);p.addColorStop(0,"rgba(255,255,255,1)"),p.addColorStop(.35,"rgba(255,255,255,0.45)"),p.addColorStop(1,"rgba(255,255,255,0)"),n.fillStyle=p,n.fillRect(0,0,64,64)}const i=new Xl(e),s=new Te({color:"#ff9e4d",map:i,transparent:!0,depthWrite:!1,blending:Fn,toneMapped:!1});this.disposables.push(i),s.visible=!1;const a=new Te({color:"#ffb366",toneMapped:!1}),o=new Te({color:"#ffffff",toneMapped:!1}),l=this.makeInstanced(new je(.1,.14,1,5).translate(0,.5,0),new ie({color:"#59636a"}),4600),c=this.makeInstanced(new ae(.5,.22,.9),t,4600),h=this.makeInstanced(new _r(1,14).rotateX(-Math.PI/2),s,4600);h.renderOrder=2;const d=this.makeInstanced(Ye,a,2200),u=30;let f=0;const m=(p,g,v,M,x,b,S=3.2,T=9.5)=>{f>=4600||(this.compose(p,x,g,0,1,4.6,1),l.setMatrixAt(f,this.matrix),this.compose(p-v*.45,x+4.55,g-M*.45,b,1,1,1),c.setMatrixAt(f,this.matrix),this.compose(p-v*S,x+.12,g-M*S,0,T,1,T),h.setMatrixAt(f,this.matrix),f+=1)};for(const p of this.layout.roadEdges){if(p.bridge||p.kind!=="arterial")continue;const[g,v]=p.points,M=Math.hypot(v.x-g.x,v.z-g.z);if(M<18)continue;const x=(v.x-g.x)/M,b=(v.z-g.z)/M,S=-b,T=x,y=-Math.atan2(b,x),A=Math.max(1,Math.floor(M/u));for(let E=0;E<A;E+=1){const P=(E+.5)/A*M,D=E%2===0?1:-1,N=g.x+x*P+S*D*(p.width/2+.9),R=g.z+b*P+T*D*(p.width/2+.9);m(N,R,S*D,T*D,Math.max(0,this.layout.terrain.height(N,R)),y)}}for(const p of this.layout.publicSites){if(p.kind!=="park")continue;const g=Math.max(10,p.radius*.7);for(let v=0;v<8;v+=1){const M=v/8*Math.PI*2,x=Math.cos(M),b=Math.sin(M),S=p.x+x*g,T=p.z+b*g;m(S,T,x,b,Math.max(0,this.layout.terrain.height(S,T)),-Math.atan2(x,-b)+Math.PI/2)}}for(const p of this.layout.highways??[]){const g=Vc(p,(M,x)=>this.layout.terrain.height(M,x));let v=0;for(let M=1;M<p.length;M+=1){const x=p[M-1],b=p[M],S=Math.hypot(b.x-x.x,b.z-x.z);if(S<1)continue;const T=(b.x-x.x)/S,y=(b.z-x.z)/S,A=-Math.atan2(y,T);for(let E=14-v;E<S;E+=34){const P=Math.floor((E+S*.37+x.x)/34)%2===0?1:-1,D=g[M-1]+(g[M]-g[M-1])*(E/S)+Vr;m(x.x+T*E-y*P*5.1,x.z+y*E+T*P*5.1,-y*P,T*P,D,A,5.1,ed/2-.3)}v=(S-(14-v))%34}}l.count=f,c.count=f,h.count=f;for(const p of[l,c,h])p.instanceMatrix.needsUpdate=!0,p.frustumCulled=!1;let _=0;for(const p of this.layout.highways??[]){const g=Vc(p,(v,M)=>this.layout.terrain.height(v,M));for(let v=1;v<p.length&&_<2190;v+=1){const M=p[v-1],x=p[v],b=Math.hypot(x.x-M.x,x.z-M.z);if(b<6||Math.abs(g[v]-g[v-1])>.15)continue;const S=-Math.atan2(x.z-M.z,x.x-M.x),T=Math.sin(S),y=Math.cos(S);for(const A of[-5.1,5.1])this.compose((M.x+x.x)/2+T*A,(g[v]+g[v-1])/2+Vr+.35,(M.z+x.z)/2+y*A,S,b,.14,.14),d.setMatrixAt(_,this.matrix),_+=1}}return d.count=_,d.instanceMatrix.needsUpdate=!0,d.frustumCulled=!1,this.disposables.push(t,s,a,o),{heads:t,pools:s,strips:a,neon:o}}buildLandmarks(){const t=this.layout.landmarks??[];if(!t.length)return;const n=Math.max(30,...this.model.buildings.map(c=>c.height))*.9,i=(c,h=0)=>{const d=new ie({color:c,emissive:new pt(c).multiplyScalar(h)});return this.disposables.push(d),d},s=(c,h,d,u,f,m,_=0)=>{const p=new Xt(c,h);return p.position.set(u,f,m),p.rotation.y=_,p.castShadow=!0,p.receiveShadow=!0,d.add(p),this.disposables.push(c),p},a=i("#f3f1ea"),o=i("#c9cfd3"),l=i("#c8473a");for(const c of t){const h=new ze,d=Math.max(.3,this.layout.terrain.height(c.x,c.z));if(h.position.set(c.x,d,c.z),h.rotation.y=c.yaw,c.kind==="tv-tower"){const u=Math.min(n,70);s(new je(1.6,3.2,u*.78,12).translate(0,u*.39,0),o,h,0,0,0),s(new yn(5.5,18,12).scale(1,.55,1),a,h,0,u*.72,0),s(new Pr(6.2,.5,6,32).rotateX(Math.PI/2),i("#7fb4c2",.8),h,0,u*.72,0),s(new je(.25,.45,u*.24,6).translate(0,u*.12,0),l,h,0,u*.78,0)}else if(c.kind==="twin-towers"){const u=Math.min(n,62);for(const f of[-1,1])s(new ae(8,u,8).translate(0,u/2,0),i("#9fb3c0"),h,f*9,0,0),s(new Rn(3,10,8).translate(0,5,0),o,h,f*9,u,0);s(new ae(10,2.4,3).translate(0,1.2,0),o,h,0,u*.55,0)}else if(c.kind==="twist-tower"){const u=Math.min(n,66),f=22;for(let m=0;m<f;m+=1)s(new ae(9,u/f*.92,9).translate(0,u/f*.46,0),i(m%2?"#a9c3cf":"#93aebb"),h,0,m*u/f,0,m/f*Math.PI*.5)}else if(c.kind==="arch"){const u=Math.min(n,26);for(const f of[-1,1])s(new ae(5,u,7).translate(0,u/2,0),a,h,f*8,0,0);s(new ae(21,6,7.4).translate(0,3,0),a,h,0,u,0),s(new ae(22,1,8).translate(0,.5,0),i("#d9d3c2"),h,0,u+6,0)}else if(c.kind==="sail-opera"){s(new ae(46,3,26).translate(0,1.5,0),i("#d9d3c2"),h,0,0,0);const u=new ie({color:"#f6f4ee",side:qe});this.disposables.push(u);const f=4;for(let m=0;m<f;m+=1){const _=13-m*2,p=new yn(_,20,12,Math.PI/2,Math.PI,0,Math.PI/2).scale(.75,1.6,.9),g=s(p,u,h,-15+m*9.5,3,0,0);g.rotation.z=-.18}}else if(c.kind==="lighthouse"){const u=Math.min(n,32),f=6;for(let m=0;m<f;m+=1){const _=3.4-m/f*1.4,p=3.4-(m+1)/f*1.4;s(new je(p,_,u/f,14).translate(0,u/f/2,0),m%2?l:a,h,0,m*u/f,0)}s(new je(2.2,2.2,3,10).translate(0,1.5,0),i("#fff2c0",1.5),h,0,u,0),s(new Rn(2.8,3,10).translate(0,1.5,0),l,h,0,u+3,0);{const m=new Te({color:new pt("#fff2c0").multiplyScalar(1.6),transparent:!0,opacity:.08,depthWrite:!1,blending:Fn,toneMapped:!1});this.disposables.push(m);const _=new ze;_.position.set(0,u+1.5,0);for(const p of[-1,1]){const g=new Xt(new Rn(7,160,16,1,!0).translate(0,-90,0).rotateZ(p*Math.PI/2),m);this.disposables.push(g.geometry),_.add(g)}h.add(_),this.landmarkSpinners.push({object:_,axis:"y",speed:.9})}}else if(c.kind==="ferris-wheel"){const u=Math.min(n*.45,20);for(const p of[-1,1])s(new ae(1,u+4,1).translate(0,(u+4)/2,0),o,h,-4,0,p*3).rotation.z=p*.18,s(new ae(1,u+4,1).translate(0,(u+4)/2,0),o,h,4,0,p*3).rotation.z=-p*.18;const f=new ze;f.position.set(0,u+4,0);const m=new Xt(new Pr(u,.45,6,48),i("#e8eef0",.6));this.disposables.push(m.geometry),f.add(m);const _=16;for(let p=0;p<_;p+=1){const g=p/_*Math.PI*2,v=new Xt(new ae(.25,u,.25).translate(0,u/2,0),o);v.rotation.z=g,this.disposables.push(v.geometry),f.add(v);const M=new Xt(new ae(2,2,2),i(["#ff6f61","#ffd166","#06d6a0","#118ab2"][p%4],.5));M.position.set(Math.cos(g)*u,Math.sin(g)*u,0),this.disposables.push(M.geometry),f.add(M)}h.add(f),this.landmarkSpinners.push({object:f,axis:"z",speed:.08})}else if(c.kind==="pagoda"){let f=0;s(new ae(16,2,16).translate(0,1,0),i("#d9d3c2"),h,0,0,0),f=2;const m=i("#3d5a4f"),_=i("#b5463a");for(let p=0;p<7;p+=1){const g=10-p*1.1;s(new ae(g,3.6,g).translate(0,1.8,0),_,h,0,f,0),s(new Rn(g*.95,1.6,4).rotateY(Math.PI/4).translate(0,.8,0),m,h,0,f+3.6,0),f+=4.4}s(new je(.2,.35,6,6).translate(0,3,0),i("#c9a24a"),h,0,f,0)}else if(c.kind==="suspension-bridge"&&c.to){h.position.set(c.x,0,c.z),h.rotation.y=-Math.atan2(c.to.z-c.z,c.to.x-c.x);const u=Math.hypot(c.to.x-c.x,c.to.z-c.z),f=Math.max(.3,this.layout.terrain.height(c.x,c.z),this.layout.terrain.height(c.to.x,c.to.z)),m=34,_=f+m-1,p=u*.18,g=u*.82,v=(p+g)/2,M=f+9,x=i("#c8473a");for(const y of[p,g]){for(const A of[-1,1])s(new ae(1.6,m,1.6).translate(0,m/2,0),x,h,y,f,A*5.5);s(new ae(1.6,1.6,12.6).translate(0,.8,0),x,h,y,f+m-4,0)}const b=this.nightLights,S=[],T=y=>{if(y<p)return f+1+y/Math.max(1,p)*(_-f-1);if(y>g)return f+1+(u-y)/Math.max(1,u-g)*(_-f-1);const A=(y-v)/((g-p)/2);return M+(_-M)*A*A};for(const y of[-1,1]){const A=[];for(let P=0;P<=40;P+=1){const D=P/40*u;A.push(new L(D,T(D),y*5.5))}const E=new Xt(new ic(new Ua(A),64,.3,5),o);this.disposables.push(E.geometry),h.add(E);for(let P=p+3;P<g-2;P+=4){const D=T(P),N=new Xt(new ae(.12,D-f-.9,.12).translate(0,(D-f-.9)/2,0),o);N.position.set(P,f+.9,y*5.5),this.disposables.push(N.geometry),h.add(N),S.push([P,D-.5,y*5.5,0])}for(let P=4;P<u-3;P+=7)S.push([P,f+1.1,y*5.2,0]);for(const P of[p,g]){S.push([P,f+m+.4,y*5.5,1]);for(let D=1;D<=4;D+=1)S.push([P,f+m*D/5,y*5.5+y*.9,1])}}if(b&&S.length){const y=(A,E,P,D)=>{if(!A.length)return;const N=new De(new ae(P,P,P),E,A.length);A.forEach((R,B)=>{this.matrix.compose(this.positionVector.set(R[0],R[1],R[2]),this.quaternion.identity(),this.scaleVector.set(1,1,1)),N.setMatrixAt(B,this.matrix),D&&N.setColorAt(B,this.color.set(B%2===0?"#38e8ff":"#ff4fd8"))}),N.instanceMatrix.needsUpdate=!0,N.instanceColor&&(N.instanceColor.needsUpdate=!0),N.frustumCulled=!1,this.disposables.push(N.geometry),h.add(N)};y(S.filter(A=>A[3]===0),b.heads,.5,!1),y(S.filter(A=>A[3]===1),b.neon,.9,!0)}}h.name=`city-landmark-${c.kind}`,this.group.add(h)}}buildCivics(){const t=this.layout.civics??[];if(!t.length)return;const e=[],n=[],i=[],s=[[],[],[]];t.forEach((l,c)=>{const h=Math.cos(l.yaw),d=Math.sin(l.yaw),u=Math.max(.3,l.y),f=Math.min(l.width,48)*.82,m=Math.min(l.depth,40)*.82,_=(M,x)=>({x:l.x+M*h+x*d,z:l.z-M*d+x*h}),p=(M,x,b,S,T,y,A)=>{const E=_(M,b);e.push({civic:c,mesh:0,index:e.length,x:E.x,y:u+x,z:E.z,sx:S,sy:T,sz:y,yaw:l.yaw,baseY:u}),s[0].push(A)},g=(M,x,b,S,T,y)=>{const A=_(M,b);n.push({civic:c,mesh:1,index:n.length,x:A.x,y:u+x,z:A.z,sx:S,sy:T,sz:S,yaw:0,baseY:u}),s[1].push(y)},v=(M,x,b,S,T,y,A)=>{const E=_(M,b);i.push({civic:c,mesh:2,index:i.length,x:E.x,y:u+x,z:E.z,sx:S,sy:T,sz:y,yaw:l.yaw,baseY:u}),s[2].push(A)};if(l.kind==="school")p(-f*.38,0,-m*.18,f*.2,9,m*.6,"#e9d9b8"),p(f*.38,0,-m*.18,f*.2,9,m*.6,"#e9d9b8"),p(0,0,-m*.42,f*.96,11,m*.16,"#f1e4c6"),p(0,11,-m*.42,f*.96,.6,m*.18,"#b5533c"),p(0,.05,m*.22,f*.62,.12,m*.42,"#b8574a"),p(0,.1,m*.22,f*.5,.14,m*.3,"#6fa65a"),g(f*.42,0,m*.4,.15,12,"#d8dcdc"),p(f*.42+1.1,10.4,m*.4,2,1.3,.1,"#d84b3a"),v(0,11.6,-m*.42,f*.96,.22,.22,"#ffd08a"),v(-f*.38,9,-m*.18+m*.3,f*.2,.22,.22,"#ffd08a"),v(f*.38,9,-m*.18+m*.3,f*.2,.22,.22,"#ffd08a"),v(0,.3,m*.22,f*.62,.14,.2,"#46e6ff");else if(l.kind==="mall"){p(0,0,0,f,10,m,"#d9d3c7"),p(0,10,0,f*.98,.4,m*.98,"#6e7275");for(let M=-2;M<=2;M+=1)p(f*.15,10.45,M*m*.16,f*.5,.06,.25,"#e8e3c8");p(-f*.3,0,0,f*.24,13,m*.5,"#6f9fb6"),g(-f*.3,13,0,Math.min(f,m)*.12,2.5,"#9ac4d4"),p(f*.42,0,-m*.42,3.2,20,3.2,"#2f6f8f"),p(f*.42,15,-m*.42-1.7,6,4,.3,"#ff6f61"),v(f*.42,15,-m*.42-1.9,6,4,.1,"#ff4fd8"),v(0,10.5,m*.5,f,.22,.22,"#ff4fd8"),v(0,10.5,-m*.5,f,.22,.22,"#46e6ff"),v(-f*.3,13.4,0,Math.min(f,m)*.25,.22,Math.min(f,m)*.25,"#46e6ff")}else p(0,0,0,f*.34,22,m*.44,"#f4f5f2"),p(-f*.32,0,m*.06,f*.3,12,m*.34,"#ecefea"),p(f*.32,0,m*.06,f*.3,12,m*.34,"#ecefea"),g(0,22,0,Math.min(f,m)*.16,.4,"#5d6266"),p(0,22.42,0,Math.min(f,m)*.16,.05,1.2,"#f2f2ee"),p(0,16,m*.225,1.4,5,.3,"#e0352b"),p(0,16,m*.225,5,1.4,.3,"#e0352b"),p(0,0,m*.36,f*.3,3.4,4,"#d84a3d"),v(0,16,m*.235,1.2,4.8,.1,"#ff4a3d"),v(0,16,m*.235,4.8,1.2,.1,"#ff4a3d"),v(0,22.2,0,f*.34,.22,m*.44,"#7fe8ff"),v(0,3.5,m*.36+2,f*.3,.22,.22,"#ff4a3d")});const a=(l,c,h,d)=>{const u=this.makeInstanced(l.clone(),ro(.18),Math.max(1,c.length));return u.castShadow=!0,u.receiveShadow=!0,u.count=c.length,h.forEach((f,m)=>u.setColorAt(m,this.color.set(f))),u.instanceColor&&(u.instanceColor.needsUpdate=!0),u.name=d,u},o=this.nightLights?new De(Ye.clone(),this.nightLights.neon,Math.max(1,i.length)):a(Ye,i,s[2],"city-civic-glow");o.count=i.length,this.nightLights&&(s[2].forEach((l,c)=>o.setColorAt(c,this.color.set(l))),o.instanceColor&&(o.instanceColor.needsUpdate=!0),o.frustumCulled=!1,o.name="city-civic-glow",this.group.add(o),this.disposables.push(o.geometry)),this.civicMeshes=[a(Ye,e,s[0],"city-civic-boxes"),a(kc,n,s[1],"city-civic-cylinders"),o],this.civicPieces=[...e,...n,...i],this.civicProgress=t.map(()=>1),this.civicTarget=t.map(()=>1);for(let l=0;l<t.length;l+=1)this.writeCivic(l)}writeCivic(t){const e=this.civicProgress[t],n=e*e*(3-2*e);for(const i of this.civicPieces)i.civic===t&&(n<=.001?this.compose(i.x,-40,i.z,0,0,0,0):this.compose(i.x,i.baseY+(i.y-i.baseY)*n,i.z,i.yaw,i.sx,i.sy*n,i.sz),this.civicMeshes[i.mesh].setMatrixAt(i.index,this.matrix));for(const i of this.civicMeshes)i.instanceMatrix.needsUpdate=!0}updateCivics(t){for(let e=0;e<this.civicTarget.length;e+=1){const n=this.civicProgress[e],i=this.civicTarget[e];n!==i&&(this.civicProgress[e]=i>n?Math.min(i,n+t/1.2):Math.max(i,n-t/.6),this.writeCivic(e))}}roofKindFor(t,e){if(e===3)return 0;const n=this.zoneById.get(t.id),i=t.seed;return t.archetype==="landmark"||t.archetype==="tower"?i>.66?2:i>.3?3:0:(n==="residential"||n==="waterfront")&&t.height<30?i<.55?1:0:n==="commercial"?i<.4?4:i<.6?3:0:n==="downtown"&&i<.35?3:0}buildHeroCrown(t){const e=kr(t.building.districtId),n=new ie({color:"#dfe6ea",emissive:new pt(e.accent).multiplyScalar(.12)}),i=new Xt(new Rn(1,1,8,1).translate(0,.5,0),n);i.castShadow=!0;const s=new Te({color:new pt(e.accent).multiplyScalar(3),toneMapped:!1}),a=[0,1,2].map(()=>new Xt(new Pr(1,.06,6,40).rotateX(Math.PI/2),s));let o=null;const l=[i.geometry,n,s,...a.map(c=>c.geometry)];{const c=new Te({color:new pt(e.accent).lerp(new pt("#ffffff"),.4).multiplyScalar(2.2),transparent:!0,opacity:.22,depthWrite:!1,blending:Fn,toneMapped:!1}),h=new je(.6,1.6,1,16,6,!0).translate(0,.5,0),d=new Float32Array(h.attributes.position.count*3);for(let u=0;u<h.attributes.position.count;u+=1){const f=h.attributes.position.getY(u),m=Math.min(1,f/.03)*Math.pow(1-f,1.6);d[u*3]=d[u*3+1]=d[u*3+2]=m}h.setAttribute("color",new Pe(d,3)),c.vertexColors=!0,c.visible=!1,o=new Xt(h,c),o.renderOrder=5,l.push(o.geometry,c),this.group.add(o)}this.group.add(i,...a),this.disposables.push(...l),this.heroParts={spire:i,rings:a,beam:o}}placeHeroCrown(t,e,n,i,s,a,o){const l=this.heroParts;if(!l)return;const c=o,h=Math.min(i,s)*.42,d=Math.max(14,a*.4);l.spire.visible=c,l.spire.position.set(t,e,n),l.spire.scale.set(h,d,h),l.rings.forEach((u,f)=>{u.visible=c;const m=.12+f*.2;u.position.set(t,e+d*m,n);const _=h*(1-m)+.6;u.scale.set(_,1,_)}),l.beam&&(l.beam.visible=c,l.beam.position.set(t,e+d,n),l.beam.scale.set(1,420,1))}facadeFor(t){const e=this.zoneById.get(t.id);return e?e==="waterfront"&&t.height<=36&&t.archetype!=="landmark"?3:e==="downtown"?2:e==="commercial"?1:e==="residential"?0:t.seed>.5?1:0:t.facade}buildMassing(){const t=this.layout.massing??[];if(!t.length)return;const e=this.makeInstanced(Ye,new ie({color:"#c9c7bd"}),t.length);t.forEach((n,i)=>{this.compose(n.x,n.y,n.z,Ft(`mass:${n.districtId}:${i}`)*.6-.3,16,n.height,12),e.setMatrixAt(i,this.matrix),e.setColorAt(i,this.color.set(i%2?"#c4c2b6":"#cdcbbf"))}),e.instanceMatrix.needsUpdate=!0,e.instanceColor&&(e.instanceColor.needsUpdate=!0),e.castShadow=!0,e.name="city-massing"}buildSeaMountains(){const t=this.layout.seaMountains??[];if(!t.length)return;const e=[...t].sort((n,i)=>i.height-n.height)[0];for(const n of t){if(n===e){const u=new Xt($y(n.radius,n.height/2,this.layout.seed),new ie({vertexColors:!0,fog:!1}));u.position.set(n.center.x,-2,n.center.z),u.name="city-sea-volcano",this.group.add(u),this.disposables.push(u.geometry,u.material);continue}const i=new Rn(n.radius,n.height,11,4),s=i.attributes.position,a=new Float32Array(s.count*3),o=new pt("#a9a496"),l=new pt("#d6d0c2"),c=new pt;for(let u=0;u<s.count;u+=1){const f=s.getX(u),m=s.getY(u),_=s.getZ(u),p=1+Fs(f*.03+n.seed,_*.03-n.seed,n.seed,3)*.22;s.setX(u,f*p),s.setZ(u,_*p),c.copy(o).lerp(l,Math.max(0,(m+n.height/2)/n.height)),a[u*3]=c.r,a[u*3+1]=c.g,a[u*3+2]=c.b}i.setAttribute("color",new Pe(a,3)),i.computeVertexNormals();const h=new ie({vertexColors:!0,fog:!1}),d=new Xt(i,h);d.position.set(n.center.x,0,n.center.z),d.name="city-sea-mountain",this.group.add(d),this.disposables.push(i,h)}}treeSpots(){const t=ce(),e=[];for(const n of this.layout.districts)e.push(...n.trees);e.push(...this.layout.parkTrees??[]);{const n=this.layout.terrain;for(const i of this.layout.roadEdges){if(i.bridge)continue;const[s,a]=i.points,o=Math.hypot(a.x-s.x,a.z-s.z);if(o<20)continue;const l=(a.x-s.x)/o,c=(a.z-s.z)/o,h=t.streetTreeSpacing*(i.kind==="arterial"?.8:1);for(let d=9,u=0;d<o-9;d+=h,u+=1){const f=u%2===0?1:-1,m=i.width/2+2.4,_=s.x+l*d-c*m*f,p=s.z+c*d+l*m*f,g=n.height(_,p);g<1.2||e.push({x:_,z:p,y:g,seed:Ft(`street:${i.id}:${u}`)})}}}return e}roundTreeGeometry(){const t=ce(),e=new je(.14,.2,.9,5).translate(0,.45,0),n=new Cr(.78,0).translate(0,1.35,0);return this.tintedMerge([[e,t.trunk],[n,t.foliage]])}palmGeometry(){const t=ce(),e=4.6,n=new je(.1,.19,e,6).translate(0,e/2,0),i=n.getAttribute("position");for(let o=0;o<i.count;o+=1){const l=i.getY(o)/e;i.setX(o,i.getX(o)+l*l*.55)}n.computeVertexNormals();const s=[[n,t.trunk]],a=8;for(let o=0;o<a;o+=1){const l=new ae(2.3,.05,.42).translate(1.15,0,0);l.rotateZ(-.42-o%2*.22),l.rotateY(o/a*Math.PI*2),l.translate(.55,e-.05,0),s.push([l,o%3===0?"#27a868":t.foliage])}return this.tintedMerge(s)}tintedMerge(t){let e=0;for(const[o]of t)e+=o.getAttribute("position").count;const n=new Float32Array(e*3);let i=0;const s=new pt;for(const[o,l]of t){s.set(l);for(let c=0;c<o.getAttribute("position").count;c+=1)n[i++]=s.r,n[i++]=s.g,n[i++]=s.b}const a=rd(t.map(([o])=>o));a.setAttribute("color",new Pe(n,3));for(const[o]of t)o.dispose();return a}applyFlora(t){if(!t.length||this.floraMeshes.length)return;const e=this.treeSpots(),n=t.reduce((s,a)=>s+a.species.weight,0),i=t.map(()=>[]);for(const s of e){let a=Ft(`flora:${s.x.toFixed(1)}:${s.z.toFixed(1)}`)*n,o=0;for(;o<t.length-1&&a>=t[o].species.weight;)a-=t[o].species.weight,o+=1;i[o].push(s)}t.forEach(({species:s,geometry:a},o)=>{const l=i[o];if(!l.length)return;const c=new ie({vertexColors:!0,flatShading:!0}),h=new De(a,c,l.length);h.castShadow=!0,h.receiveShadow=!0;const d=s.tint?new pt(s.tint):null;l.forEach((u,f)=>{const m=s.height*(.8+u.seed*.45);this.compose(u.x,u.y-.1,u.z,u.seed*Math.PI*2,m,m,m),h.setMatrixAt(f,this.matrix),h.setColorAt(f,d?this.color.copy(d).lerp(new pt("#ffffff"),.25+u.seed*.2):this.color.set("#ffffff").multiplyScalar(.88+u.seed*.2))}),h.instanceMatrix.needsUpdate=!0,h.instanceColor&&(h.instanceColor.needsUpdate=!0),h.name=`city-flora-${o}`,this.group.add(h),this.floraMeshes.push(h),this.disposables.push(c)}),this.floraMeshes.length&&(this.treeMesh.visible=!1)}buildTrees(){const t=this.treeSpots(),e=this.palmGeometry(),n=new ie({vertexColors:!0}),i=new De(e,n,Math.max(t.length,1));return i.castShadow=!0,t.forEach((s,a)=>{const o=1.25+s.seed*.7;this.compose(s.x,s.y-.1,s.z,s.seed*Math.PI*2,o,o,o),i.setMatrixAt(a,this.matrix)}),i.count=t.length,this.group.add(i),this.disposables.push(e,n),i}buildCars(){const t=[];for(const o of this.layout.districts)for(const l of o.carPaths){const{cumulative:c,total:h}=nd(l);t.push({points:l,cumulative:c,total:h,y:.08,terrain:o.terrain})}const e=[];t.forEach((o,l)=>{for(let h=0;h<3;h+=1){const d=Ft(`car:${l}:${h}`);e.push({path:o,distance:h/3*o.total+d*5,speed:6.5+d*6})}});const n=["#f8f5ec","#c96f4a","#4d7ca8","#3f8f7a","#d8a13c","#8d5a5a"],i=new ae(2.5,.8,1.2).translate(0,.4,0),s=new ie({color:"#ffffff"}),a=new De(i,s,Math.max(e.length,1));return a.instanceMatrix.setUsage(Si),e.forEach((o,l)=>{const c=n[Math.floor(Ft(`carc:${l}`)*n.length)];a.setColorAt(l,this.color.set(c))}),a.count=e.length,a.frustumCulled=!1,this.group.add(a),this.disposables.push(i,s),{mesh:a,cars:e}}buildBoats(){var m;const t=[];(m=this.layout.boatLoops)==null||m.forEach((_,p)=>{const{cumulative:g,total:v}=nd(_),M=3+p%2;for(let x=0;x<M;x+=1)t.push({path:{points:_,cumulative:g,total:v,y:-.3,terrain:null},distance:x/M*v+Ft(`bd:${p}:${x}`)*40,speed:(p%2===0?1:-1)*(2.6+Ft(`bs:${p}:${x}`)*1.6),phase:Ft(`bp:${p}:${x}`)*Math.PI*2,wakeTimer:Ft(`bt:${p}:${x}`)*.3})});const e=new ae(11.5,2,4).translate(0,1,0),n=new ae(4.3,1.8,2.9).translate(1.4,2.9,0),i=rd([e,n]),s=new ie({color:"#f2efe6"}),a=new De(i,s,Math.max(t.length,1));a.instanceMatrix.setUsage(Si),t.forEach((_,p)=>{a.setColorAt(p,this.color.set(p%3===0?"#c96f4a":p%3===1?"#5d7f9a":"#e8e2d5"))}),a.count=t.length,a.frustumCulled=!1,this.group.add(a),this.disposables.push(i,s,e,n);const o=Os();o.width=o.height=64;const l=o.getContext("2d");if(l){const _=l.createRadialGradient(32,32,0,32,32,32);_.addColorStop(0,"rgba(255,255,255,0.95)"),_.addColorStop(.45,"rgba(255,255,255,0.4)"),_.addColorStop(1,"rgba(255,255,255,0)"),l.fillStyle=_,l.fillRect(0,0,64,64)}const c=new Xl(o),h=new Te({color:"#eef6f7",map:c,transparent:!0,opacity:.5,depthWrite:!1,toneMapped:!1}),d=new _r(1,10).rotateX(-Math.PI/2),u=new De(d,h,128);u.instanceMatrix.setUsage(Si),u.frustumCulled=!1,u.renderOrder=1;const f=[];for(let _=0;_<128;_+=1)f.push({x:0,z:0,birth:-1,driftX:0,driftZ:0}),this.compose(0,-60,0,0,1e-4,1e-4,1e-4),u.setMatrixAt(_,this.matrix);return this.group.add(u),this.disposables.push(c,h,d),{mesh:a,boats:t,wakeMesh:u,wakes:f}}buildClouds(){const t=[],e=this.layout.boundsRadius+40;for(let a=0;a<3;a+=1){const o=Ft(`cloud:${a}`);t.push({x:(o-.5)*e*2,z:(Ft(`cz:${a}`)-.5)*e*2,y:220+o*44,speed:.65+o*.7,scale:.5+o*.4})}const n=new yn(1,8,6),i=new ie({color:"#ffffff",transparent:!0,opacity:.88,fog:!1}),s=new De(n,i,t.length);return s.instanceMatrix.setUsage(Si),t.forEach((a,o)=>{const l=9.5*a.scale;this.compose(a.x,a.y,a.z,0,l*1.6,l*.34,l*.8),s.setMatrixAt(o,this.matrix)}),s.count=t.length,s.frustumCulled=!1,this.group.add(s),this.disposables.push(n,i),{mesh:s,clouds:t}}buildAnomalyMarkers(){for(const t of this.layout.districts){if(!t.anomaly)continue;const e=t.anomaly.severity==="critical"?"#d64545":t.anomaly.severity==="warning"?"#e0940f":"#4a7fa0",n=new ec(1.15),i=new Te({color:e}),s=new Xt(n,i);s.position.set(t.plaza.x,t.plaza.y+9,t.plaza.z),s.renderOrder=2;const a=new Rr(2.6,3,44).rotateX(-Math.PI/2),o=new Te({color:e,transparent:!0,opacity:.5,depthWrite:!1}),l=new Xt(a,o);l.position.set(t.plaza.x,t.plaza.y+.16,t.plaza.z),l.renderOrder=3,this.group.add(s,l),this.anomalyMarkers.push({mesh:s,ring:l,baseY:t.plaza.y+9,phase:Ft(`anom:${t.id}`)*Math.PI*2}),this.disposables.push(n,i,a,o)}}buildLabels(){for(const t of this.layout.districts){const e=kr(t.id),n=`${t.sessionCount} sessions`,{texture:i,aspect:s}=Wy(t.label,n,e.accent);i.colorSpace=Fe;const a=new kh({map:i,depthTest:!1,transparent:!0,sizeAttenuation:!1}),o=new Fp(a),l=.018;o.scale.set(l*s,l,1),o.renderOrder=20,o.position.set(t.center.x,t.plaza.y+45,t.center.z),this.group.add(o),this.labels.push(o),this.disposables.push(a,i)}}buildWater(){const t=new Vn(9e3,9e3,1,1).rotateX(-Math.PI/2),e=384,n=1500,i=new Uint8Array(e*e);for(let l=0;l<e;l+=1)for(let c=0;c<e;c+=1){const h=(c/(e-1)-.5)*n*2,d=(l/(e-1)-.5)*n*2,u=this.layout.terrain.height(h,d);i[l*e+c]=Math.max(0,Math.min(255,Math.round(-u/16*255)))}const s=new _s(i,e,e,$r,sn);s.minFilter=Ne,s.magFilter=Ne,s.wrapS=bn,s.wrapT=bn,s.needsUpdate=!0,this.disposables.push(s);const a=new le({uniforms:{uTime:{value:0},uSun:{value:new L(.55,.75,.36).normalize()},uDeep:{value:new pt(ce().water.deep)},uShallow:{value:new pt(ce().water.shallow)},uSky:{value:new pt(ce().water.sky)},uDepth:{value:s},uDepthWorld:{value:n},uFog:{value:new pt(ce().skyHorizon)},uFogRange:{value:new ft(...ce().waterFog)},uNormal:{value:null},uMirror:{value:null},uMirrorMatrix:{value:new It},uHasMirror:{value:0},uNight:{value:0},uSkyTex:{value:null},uHasAssets:{value:0},uGradeTop:{value:new pt(ce().skyGrade.top)},uGradeHorizon:{value:new pt(ce().skyGrade.horizon)},uGradeAmount:{value:ce().skyGrade.amount},uSkyYaw:{value:Sc(ce())}},vertexShader:`
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,fragmentShader:`
        uniform float uTime;
        uniform vec3 uSun;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uSky;
        uniform vec3 uFog;
        uniform vec2 uFogRange;
        uniform sampler2D uNormal;
        uniform sampler2D uMirror;
        uniform mat4 uMirrorMatrix;
        uniform float uHasMirror;
        uniform float uNight;
        uniform sampler2D uSkyTex;
        uniform float uHasAssets;
        uniform vec3 uGradeTop;
        uniform vec3 uGradeHorizon;
        uniform float uGradeAmount;
        uniform float uSkyYaw;
        uniform sampler2D uDepth;
        uniform float uDepthWorld;
        varying vec3 vWorld;
        // 与天空球同一套采样 + 调色：反射和远处淡出都要与天空完全一致，否则地平线出现接缝。
        vec3 skyAt(vec3 dir) {
          dir = normalize(dir);
          vec2 uv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5 + uSkyYaw, asin(clamp(dir.y, 0.002, 1.0)) / 3.1415927 + 0.5);
          vec3 photo = texture2D(uSkyTex, uv).rgb;
          vec3 tint = mix(uGradeHorizon, uGradeTop, smoothstep(0.0, 0.6, max(dir.y, 0.0)));
          return mix(photo, photo * tint * 1.55, uGradeAmount);
        }
        // 水面法线贴图（512²）在该 uv 处的 mip 级：0 = 1 texel/像素，每 +1 = 降采样一倍。
        float waterMip(vec2 uv) {
          vec2 d = fwidth(uv) * 512.0;
          return log2(max(max(d.x, d.y), 1e-4));
        }
        float rHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
        vec2 rHash2(vec2 c) { return fract(sin(vec2(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)))) * 43758.5453); }
        // 平滑值噪声（格点哈希 + smoothstep 插值）：没有周期，等值线不成点阵。
        float valueNoise(vec2 q) {
          vec2 i = floor(q);
          vec2 f = fract(q);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = rHash(i);
          float b = rHash(i + vec2(1.0, 0.0));
          float c = rHash(i + vec2(0.0, 1.0));
          float e = rHash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, e, u.x), u.y);
        }
        // 一层涟漪：格距 cell；查 3×3 邻格（中心在格内 0.15–0.85、半径 ≤ 0.85 格，跨格的环也能画到）。
        float rippleLayer(vec2 p, float cell, float t, float seed) {
          vec2 g = floor(p / cell);
          float acc = 0.0;
          for (int i = -1; i <= 1; i++) {
            for (int j = -1; j <= 1; j++) {
              vec2 c = g + vec2(float(i), float(j));
              float period = 3.0 + rHash(c + seed) * 5.0;              // 时间：每格自己的周期
              float phase = t / period + rHash(c + seed + 7.1);        // …且错相
              float cycle = floor(phase);
              float age = fract(phase);
              float alive = step(0.45, rHash(c + cycle * 3.3 + seed + 1.7)); // 约一半轮次不出现
              vec2 center = (c + 0.15 + rHash2(c + cycle * 13.7 + seed) * 0.7) * cell; // 位置：每轮重抽
              float maxR = cell * (0.3 + 0.55 * rHash(c + cycle * 5.9 + seed + 4.2)); // 大小：每轮随机
              float r = age * maxR;
              float width = 0.7 + r * 0.06;
              float ring = 1.0 - smoothstep(0.0, width, abs(length(p - center) - r));
              acc += ring * (1.0 - age) * (1.0 - age) * alive;
            }
          }
          return acc;
        }
        // 离岸深度（构建期烘焙）：0 = 水线，1 = 深水；纹理外一律深水。
        float shoreDepth(vec2 p) {
          vec2 uv = p / (uDepthWorld * 2.0) + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
          return texture2D(uDepth, uv).r;
        }
        void main() {
          vec2 p = vWorld.xz;
          // 不再用解析波（几组平面波之和）做法线：平面波相加本身是二维干涉点阵，波峰周期性对齐，
          // 镜面高光 pow(·,64) 在每个波峰上点出一颗一模一样的白椭圆，满海排成格子（拍照实测：
          // 关掉碎光、法线贴图、镜面倒影、尾迹之后椭圆都还在）。法线只来自下面旋转错开的法线贴图层，
          // 起伏的随机感交给随机涟漪。
          vec3 n = vec3(0.0, 1.0, 0.0);
          if (uHasAssets > 0.5) {
            // 两层反向滚动的法线贴图：细碎波纹不再是规则的正弦格。
            // 曾是 p/46、p/19 两层轴对齐平铺：同一块贴图每 46 单位原样复制，掠射角下菲涅尔
            // 反射把每块的法线偏转放大成一颗暗椭圆，全海排成规则点阵。现在三层各自旋转到
            // 非轴向、尺度互不整除（重复周期错开），再用低频场混合权重，平铺不再对齐成格。
            vec2 pa = mat2(0.857, 0.515, -0.515, 0.857) * p;   // 31°
            vec2 pb = mat2(0.682, -0.731, 0.731, 0.682) * p;   // -47°
            vec2 pc = mat2(0.276, 0.961, -0.961, 0.276) * p;   // 74°
            vec2 uvA = pa / 41.3 + vec2(uTime * 0.010, uTime * 0.006);
            vec2 uvB = pb / 15.7 - vec2(uTime * 0.007, -uTime * 0.011);
            vec2 uvC = pc / 113.0 + vec2(uTime * 0.004, -uTime * 0.003);
            vec3 a = texture2D(uNormal, uvA).xyz * 2.0 - 1.0;
            vec3 b = texture2D(uNormal, uvB).xyz * 2.0 - 1.0;
            vec3 c = texture2D(uNormal, uvC).xyz * 2.0 - 1.0;
            // 旋转只把点阵转斜，不消除周期（上一版修复的错）。真正成格的原因：一层平铺在屏幕上
            // 只有几十像素时，512² 贴图被 mip 降采样 ~3 级，细节滤光、只剩「以平铺尺寸为周期」的
            // 低频分量——一张干净的正弦格，再被掠射菲涅尔放大。按各层自己的 mip 级淡出：细节一旦
            // 被滤掉就不再贡献法线，留下的起伏由下面 wave() 的解析法线（非格点平面波）接管。
            float wA = 1.0 - smoothstep(1.0, 2.5, waterMip(uvA));
            float wB = 1.0 - smoothstep(1.0, 2.5, waterMip(uvB));
            float wC = 1.0 - smoothstep(1.0, 2.5, waterMip(uvC));
            float mixW = 0.5 + 0.5 * sin(p.x * 0.013 + p.y * 0.017) * sin(p.y * 0.011 - p.x * 0.007);
            vec3 t = a * wA * (0.6 + 0.4 * mixW) + b * wB * (1.0 - 0.4 * mixW) + c * wC * 0.7;
            float strength = 0.28;
            n = normalize(vec3(t.x * strength + n.x * 0.5, 1.0, t.y * strength + n.z * 0.5));
          }
          vec3 view = normalize(cameraPosition - vWorld);
          float fresnel = pow(1.0 - max(dot(n, view), 0.0), 2.4);
          vec3 base = mix(uShallow, uDeep, clamp(length(p) / 420.0, 0.0, 1.0));
          vec3 skyColor = uHasAssets > 0.5 ? mix(skyAt(reflect(-view, n)), uSky, uNight) : uSky; // 夜里不再倒映晚霞照片
          if (uHasMirror > 0.5) {
            // 镜像贴图按投影坐标采样，再用波纹法线扰动：倒影随水波轻晃而不是一面硬镜子。
            vec4 projected = uMirrorMatrix * vec4(vWorld, 1.0);
            vec2 mirrorUv = projected.xy / projected.w + n.xz * 0.035;
            skyColor = texture2D(uMirror, mirrorUv).rgb;
          }
          // 有镜面倒影时反射占比更高：平静海面在斜视角下几乎就是一面镜子。
          float reflectance = uHasMirror > 0.5 ? 0.04 + fresnel * 0.9 : (uHasAssets > 0.5 ? 0.12 + fresnel * 0.78 : fresnel * 0.6);
          vec3 color = mix(base, skyColor, reflectance);
          float specular = pow(max(dot(reflect(-normalize(uSun), n), view), 0.0), 64.0);
          color += vec3(1.0, 0.97, 0.88) * specular * 1.05;
          // ── 随机涟漪 ─────────────────────────────────────────────────────
          // 曾是 sin×sin×sin 的「碎光」乘积场 × 正弦掩码 × 波峰门控：正弦的乘积本身是周期点阵，
          // 满海排成规则的白椭圆（拍照实测，关掉法线贴图/镜面/尾迹都还在）。现在是真正的涟漪：
          // 海面按格子划分，每格每一轮——中心在格内随机重抽（位置随机）、周期 3–8 秒且各自错相
          // 并有约一半轮次不出现（时间随机）、最大半径随机（大小随机）；两层不同格距（22/47，
          // 第二层旋转）混出大小涟漪。全部由 uTime 与哈希决定：导出仍可复现。
          float dist = distance(cameraPosition, vWorld);
          float sunPath = smoothstep(0.55, 0.95, dot(reflect(-normalize(uSun), n), view));
          float ripples = rippleLayer(p, 22.0, uTime, 0.0)
            + rippleLayer(mat2(0.6, 0.8, -0.8, 0.6) * p, 47.0, uTime * 0.8, 31.0) * 0.75;
          // 环宽 ~1 单位：屏幕上一像素已经大于环宽时淡出（远处不闪成噪点），再进雾前柔和收尾。
          float footprint = length(fwidth(p));
          ripples *= (1.0 - smoothstep(0.5, 1.6, footprint)) * (1.0 - smoothstep(650.0, 1100.0, dist));
          color += vec3(0.88, 0.95, 1.0) * ripples * 0.16 * (1.0 - uNight * 0.75);
          // 太阳反射带里的涟漪更亮（碎金）：只在日间。
          color += vec3(1.0, 0.98, 0.9) * ripples * sunPath * 0.55 * (1.0 - uNight);
          // ── 岸线涟漪（tinyskies Globe 手法，作者授权移植）──────────────────
          // 只此一件：fract(深度×频率−时间) 生成向岸滚动的白色波纹带，sin 噪声让
          // 条带不规则、深度衰减离岸消失。深度驱动、空间上低频（条带宽 ~10-30 单
          // 位），远处（700–1400）柔和淡出防混叠；不动碎光、不加开阔海面浪花。
          float d = shoreDepth(p);
          if (d < 0.8) {
            float dayFade = 1.0 - uNight * 0.6;
            // 条带的不规则来自哈希值噪声（非周期），不再是两个正弦之和——深度在大片浅滩/陆下近乎常数时，
            // 条带退化成噪声的等值线，正弦和的等值线是一张规则的椭圆点阵，满海一圈圈白椭圆（拍照实测）。
            float nz = (valueNoise(p * 0.035 + vec2(uTime * 0.05, -uTime * 0.03)) - 0.5) * 0.09
              + (valueNoise(p * 0.09 - vec2(uTime * 0.04, uTime * 0.06)) - 0.5) * 0.04;
            float contour = fract((d + nz) * 4.0 - uTime * 0.42);
            // 只在深度真的在变的地方画（靠近真实岸线）：用 2 单位差分估深度梯度，平坦处不画条带。
            float grad = length(vec2(shoreDepth(p + vec2(2.0, 0.0)) - d, shoreDepth(p + vec2(0.0, 2.0)) - d)) * 0.5;
            float band = smoothstep(0.45, 0.7, contour) * (1.0 - smoothstep(0.75, 1.0, contour));
            // 只留最靠岸的一窄条：窄河里深度处处都浅，曾整条河铺满白色条带、读作结冰（拍照实测）。
            float depthFade = 1.0 - smoothstep(0.03, 0.3, d);
            float bandFade = 1.0 - smoothstep(700.0, 1400.0, dist);
            float slopeFade = smoothstep(0.0012, 0.004, grad);
            color = mix(color, vec3(0.9, 0.97, 0.98), band * depthFade * bandFade * slopeFade * 0.45 * dayFade);
          }
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          // 雾混在色调映射之后：scene.background 不经色调映射，先混再映射会让远水发灰、与天空出现色带。
          vec3 fogColor = uFog;
          if (uHasAssets > 0.5) {
            // 远处淡出到「这个方向地平线上的天空」，而不是一个常数色。
            vec3 horizonDir = normalize(vec3(vWorld.x - cameraPosition.x, 0.0, vWorld.z - cameraPosition.z));
            fogColor = skyAt(horizonDir + vec3(0.0, 0.01, 0.0));
          }
          // 夜里远海淡出到夜雾色：skyAt 采样的是黄昏照片，天穹入夜后换成渐变，水面却一直淡出到照片里的
          // 晚霞——23 点远海一整条粉红光带（用户截图「光照污染」）。
          fogColor = mix(fogColor, uSky, uNight); // uSky 每个 tick 按当前档位的雾色更新；uFog 是主题常量（迈阿密的晚霞橙），夜里不能用
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(uFogRange.x, uFogRange.y, dist));
          #include <colorspace_fragment>
        }
      `});this.waterAssetUniforms=a.uniforms;const o=new Xt(t,a);return o.position.y=-.55,this.disposables.push(t,a),o}buildRuntimes(){var u;const t=new Map(this.layout.districts.map(f=>[f.id,f]));let e=0,n=0,i=0,s=0,a=0,o=0;const l=[0,0,0,0];let c=0;const h=[...this.model.buildings].sort((f,m)=>f.startedAt-m.startedAt);for(const f of h){const m=t.get(f.districtId),_=m==null?void 0:m.slots.get(f.id);if(!m||!_)continue;const p=kr(f.districtId),g={building:f,slot:_,facade:-1,groundY:m.grounds.get(f.id)??0,paletteWall:new pt(p.wall).multiplyScalar(.92+f.seed*.16),display:((u=this.previousDisplays)==null?void 0:u.get(f.id))??0,target:f.builtFraction,settled:this.previousDisplays?this.previousDisplays.has(f.id):!0,district:m,shaftPrimary:-1,shaftUpper:-1,podium:-1,roof:-1,scaffold:-1,antenna:-1,beacon:-1,craneMast:-1,craneArm:-1,cranePhase:f.seed*Math.PI*2,craneX:0,craneZ:0,blinkPhase:Ft(`blink:${f.id}`)*Math.PI*2,deco:-1,roofKind:0,hero:!1};if(g.facade=this.facadeFor(f),g.facade===3){g.deco=c,c+=1,g.paletteWall=new pt(p.accent).lerp(new pt("#ffffff"),.52).multiplyScalar(.96+f.seed*.08);const y=new pt(p.accent).lerp(new pt("#ffffff"),.35);this.decoCornerMesh.setColorAt(g.deco,g.paletteWall.clone().multiplyScalar(1.06)),this.decoTrimMesh.setColorAt(g.deco*2,y),this.decoTrimMesh.setColorAt(g.deco*2+1,y.clone().multiplyScalar(.92))}const v=this.shaftMeshes[g.facade],M=this.shaftIdByInstance[g.facade],x=f.archetype==="tower"||f.archetype==="landmark";g.shaftPrimary=l[g.facade],v.setColorAt(g.shaftPrimary,g.paletteWall),v.geometry.getAttribute("aFloors").setX(g.shaftPrimary,Math.max(2,Math.round(f.height/3.1))),M.set(g.shaftPrimary,f.id),l[g.facade]+=1,x&&(g.shaftUpper=l[g.facade],v.setColorAt(g.shaftUpper,g.paletteWall.clone().multiplyScalar(.94)),v.geometry.getAttribute("aFloors").setX(g.shaftUpper,Math.max(2,Math.round(f.height*.28/3.1))),M.set(g.shaftUpper,f.id),l[g.facade]+=1),f.archetype!=="tower"&&f.archetype!=="landmark"&&(g.podium=e,this.podiumMesh.setColorAt(e,g.paletteWall.clone().multiplyScalar(.88)),e+=1),g.roof=n,this.roofMesh.setColorAt(n,new pt(p.roof).multiplyScalar(.94+f.seed*.12)),g.roofKind=this.roofKindFor(f,g.facade);const T=[new pt(p.roof).multiplyScalar(.94+f.seed*.12),new pt(p.accent).lerp(new pt("#e8eef0"),.55),g.paletteWall.clone().multiplyScalar(.96),new pt("#7fae6a")];this.roofProfiles.forEach((y,A)=>y.setColorAt(n,T[A])),this.neonMesh.setColorAt(n,new pt(p.accent).multiplyScalar(3.2)),n+=1,g.scaffold=i,i+=1,f.archetype==="landmark"&&s<94&&(g.antenna=s,s+=1,g.beacon=a,a+=1),f.active&&o<46&&(g.craneMast=o,g.craneArm=o,o+=1),this.runtimes.push(g),this.runtimeById.set(f.id,g)}this.shaftMeshes.forEach((f,m)=>{f.count=l[m],f.instanceColor&&(f.instanceColor.needsUpdate=!0)}),this.podiumMesh.count=e,this.podiumMesh.instanceColor&&(this.podiumMesh.instanceColor.needsUpdate=!0),this.roofMesh.count=n;for(const f of this.roofProfiles)f.count=n,f.instanceColor&&(f.instanceColor.needsUpdate=!0);this.gardenTreeMesh.count=n*3;let d=null;for(const f of this.runtimes)(!d||f.building.tokensTotal>d.building.tokensTotal)&&(d=f);d&&(d.hero=!0,d.roofKind=0,this.buildHeroCrown(d)),this.neonMesh.count=n,this.neonMesh.instanceColor&&(this.neonMesh.instanceColor.needsUpdate=!0),this.roofMesh.instanceColor&&(this.roofMesh.instanceColor.needsUpdate=!0),this.scaffoldMesh.count=i,this.antennaMesh.count=s,this.beaconMesh.count=a,this.craneMastMesh.count=o,this.decoCornerMesh.count=c,this.decoTrimMesh.count=c*2,this.decoCornerMesh.instanceColor&&(this.decoCornerMesh.instanceColor.needsUpdate=!0),this.decoTrimMesh.instanceColor&&(this.decoTrimMesh.instanceColor.needsUpdate=!0),this.craneArmMesh.count=o;for(const f of this.runtimes)this.applyConstruction(f,f.settled)}compose(t,e,n,i,s,a,o){this.euler.set(0,i,0),this.quaternion.setFromEuler(this.euler),this.positionVector.set(t,e,n),this.scaleVector.set(Math.max(s,1e-4),Math.max(a,1e-4),Math.max(o,1e-4)),this.matrix.compose(this.positionVector,this.quaternion,this.scaleVector)}applyConstruction(t,e){const n=t.building,{x:i,z:s}=t.slot,a=t.groundY,o=e?t.target:t.display,l=Math.max(0,Math.min(1,o));if(l<=.001){this.hideAll(t);return}const c=n.height,h=n.footprint,d=Math.max(.5,l*c),u=n.archetype==="tower"||n.archetype==="landmark"?.72:1,f=t.podium>=0?Math.min(d,1.5):0;let m;n.archetype==="slab"?m=[h*1.3,h*.58]:n.archetype==="block"?m=[h*1.2,h*.85]:n.archetype==="tower"||n.archetype==="landmark"?m=[h*.86,h*.55]:m=[h,h];const _=t.slot.width*(t.slot.zone==="downtown"?.8:.88);n.archetype!=="tower"&&n.archetype!=="landmark"&&(m[0]=Math.max(m[0],_)),m[0]=Math.min(m[0],t.slot.width-.8),m[1]=Math.min(m[1],t.slot.depth-2);const p=t.slot.yaw,g=a+f,v=a+Math.min(d,c*u),M=Math.max(0,v-g);if(t.shaftPrimary>=0&&(M<.15?this.compose(i,-40,s,0,0,0,0):this.compose(i,g,s,p,m[0],M,m[1]),this.shaftMeshes[t.facade].setMatrixAt(t.shaftPrimary,this.matrix)),t.shaftUpper>=0){const x=Math.max(0,d-c*u);x<.15?this.compose(i,-40,s,0,0,0,0):this.compose(i,a+c*u,s,p,m[0]*.72,x,m[1]*.72),this.shaftMeshes[t.facade].setMatrixAt(t.shaftUpper,this.matrix)}if(t.podium>=0&&(this.compose(i,a,s,p,h*1.16,f>.1?f:0,h*1.16),this.podiumMesh.setMatrixAt(t.podium,this.matrix)),t.roof>=0){const x=a+Math.max(.4,d-.18),b=t.shaftUpper>=0&&d>c*u?m[0]*.78:m[0]*1.06,S=t.shaftUpper>=0&&d>c*u?m[1]*.78:m[1]*1.06;this.compose(i,x,s,p,b,.34,S),this.roofMesh.setMatrixAt(t.roof,this.matrix),this.compose(i,x-.12,s,p,b*1.16,.3,S*1.16),this.neonMesh.setMatrixAt(t.roof,this.matrix);const T=l>.985,y=x+.34;this.roofProfiles.forEach((A,E)=>{const P=E+1;!T||t.roofKind!==P?this.compose(i,-40,s,0,0,0,0):P===1?this.compose(i,y,s,p,b,Math.min(b,S)*.42,S):P===2?this.compose(i,y,s,p,b*.92,Math.max(6,c*.22),S*.92):P===3?this.compose(i,y,s,p,b*.62,Math.max(2.4,c*.06),S*.62):this.compose(i,y,s,p,b*.86,.35,S*.86),A.setMatrixAt(t.roof,this.matrix)});for(let A=0;A<3;A+=1){if(T&&t.roofKind===4){const E=t.building.seed*6.283+A*2.1,P=Math.min(b,S)*.28,D=.7+(t.building.seed*7+A)%1*.5;this.compose(i+Math.cos(E)*P,y+.3,s+Math.sin(E)*P,0,D,D*1.1,D)}else this.compose(i,-40,s,0,0,0,0);this.gardenTreeMesh.setMatrixAt(t.roof*3+A,this.matrix)}t.hero&&this.placeHeroCrown(i,x+.34,s,b,S,c,T)}if(t.scaffold>=0){const x=c-d;l<.985&&x>.6?this.compose(i,a+d,s,p,m[0]*1.14,x,m[1]*1.14):this.compose(i,-40,s,0,0,0,0),this.scaffoldMesh.setMatrixAt(t.scaffold,this.matrix)}if(t.deco>=0){const x=(P,D)=>({x:i+P*Math.cos(p)+D*Math.sin(p),z:s-P*Math.sin(p)+D*Math.cos(p)}),b=Math.min(m[0],m[1])*.24,S=x(m[0]/2-b*.55,m[1]/2-b*.55);this.compose(S.x,a,S.z,0,b,Math.max(.2,d+.4),b),this.decoCornerMesh.setMatrixAt(t.deco,this.matrix);const T=l>.985,y=x(0,m[1]*.1);this.compose(y.x,a+d,y.z,p,T?m[0]*.42:0,T?2.4:0,T?m[1]*.7:0),this.decoTrimMesh.setMatrixAt(t.deco*2,this.matrix);const A=x(-m[0]*.08,m[1]/2+.8),E=d>3.4;this.compose(A.x,a+2.7,A.z,p,E?m[0]*.66:0,E?.28:0,E?1.7:0),this.decoTrimMesh.setMatrixAt(t.deco*2+1,this.matrix)}if(t.antenna>=0){const x=l>.985;this.compose(i,a+c,s,0,1,x?c*.1+3.4:0,1),this.antennaMesh.setMatrixAt(t.antenna,this.matrix),this.compose(i,a+c+(x?c*.1+3.4:0),s,0,1,1,1),this.beaconMesh.setMatrixAt(t.beacon>=0?t.beacon:0,this.matrix)}if(t.craneMast>=0){const x=c*1.02+6.5,b=m[0]*.5+.6,S=m[1]*.5+.6,T=i+b*Math.cos(p)+S*Math.sin(p),y=s-b*Math.sin(p)+S*Math.cos(p);t.craneX=T,t.craneZ=y,this.compose(T,a,y,0,1,x,1),this.craneMastMesh.setMatrixAt(t.craneMast,this.matrix),this.applyCraneArm(t,T,y,a,x,0)}}applyCraneArm(t,e,n,i,s,a){const o=t.building.footprint*2.4+3.4,l=t.cranePhase+a,c=e+Math.cos(l)*o*.34,h=n-Math.sin(l)*o*.34;this.compose(c,i+s+.1,h,l,o,2.2,2.2),this.craneArmMesh.setMatrixAt(t.craneArm,this.matrix)}hideAll(t){if(this.compose(0,-40,0,0,0,0,0),t.building,t.shaftPrimary>=0&&this.shaftMeshes[t.facade].setMatrixAt(t.shaftPrimary,this.matrix),t.shaftUpper>=0&&this.shaftMeshes[t.facade].setMatrixAt(t.shaftUpper,this.matrix),t.podium>=0&&this.podiumMesh.setMatrixAt(t.podium,this.matrix),t.deco>=0&&(this.decoCornerMesh.setMatrixAt(t.deco,this.matrix),this.decoTrimMesh.setMatrixAt(t.deco*2,this.matrix),this.decoTrimMesh.setMatrixAt(t.deco*2+1,this.matrix)),t.roof>=0){this.roofMesh.setMatrixAt(t.roof,this.matrix),this.neonMesh.setMatrixAt(t.roof,this.matrix);for(const e of this.roofProfiles)e.setMatrixAt(t.roof,this.matrix);for(let e=0;e<3;e+=1)this.gardenTreeMesh.setMatrixAt(t.roof*3+e,this.matrix);t.hero&&this.heroParts&&this.placeHeroCrown(0,-40,0,0,0,0,!1)}t.scaffold>=0&&this.scaffoldMesh.setMatrixAt(t.scaffold,this.matrix),t.antenna>=0&&this.antennaMesh.setMatrixAt(t.antenna,this.matrix),t.beacon>=0&&this.beaconMesh.setMatrixAt(t.beacon,this.matrix),t.craneMast>=0&&(this.craneMastMesh.setMatrixAt(t.craneMast,this.matrix),this.craneArmMesh.setMatrixAt(t.craneArm,this.matrix))}applyCursor(t,e,n=0){this.cursor=t,this.live=e,(this.layout.civics??[]).forEach((i,s)=>{this.civicTarget[s]=e||t>=i.unlockAt?1:0});for(const i of this.runtimes)i.target=Iy(i.building,t,e,n),e&&i.building.active&&(i.target=Math.max(i.target,i.building.builtFraction))}displaySnapshot(){const t=new Map;for(const[e,n]of this.runtimeById)t.set(e,n.display);return t}snapToTargets(){for(const t of this.runtimes)t.settled&&(t.display=t.target,this.applyConstruction(t,!0));for(let t=0;t<this.civicTarget.length;t+=1)this.civicProgress[t]!==this.civicTarget[t]&&(this.civicProgress[t]=this.civicTarget[t],this.writeCivic(t));for(const t of this.shaftMeshes)t.instanceMatrix.needsUpdate=!0;this.podiumMesh.instanceMatrix.needsUpdate=!0,this.decoCornerMesh.instanceMatrix.needsUpdate=!0,this.decoTrimMesh.instanceMatrix.needsUpdate=!0;for(const t of this.roofProfiles)t.instanceMatrix.needsUpdate=!0;this.gardenTreeMesh.instanceMatrix.needsUpdate=!0,this.roofMesh.instanceMatrix.needsUpdate=!0,this.neonMesh.instanceMatrix.needsUpdate=!0,this.scaffoldMesh.instanceMatrix.needsUpdate=!0,this.antennaMesh.instanceMatrix.needsUpdate=!0,this.craneMastMesh.instanceMatrix.needsUpdate=!0}setQualityLevel(t){this.cloudMesh.visible=t>=1,this.carKeep=t>=1?1:.5,this.applyCarDensity()}applyCarDensity(){const t=Math.floor(this.cars.length*this.carKeep);this.cars.forEach((e,n)=>{const i=sd(e);e.speed=n<t?i:0,this.placeCar(e,n,n<t)}),this.carMesh.instanceMatrix.needsUpdate=!0}placeCar(t,e,n){if(!n)this.compose(0,-40,0,0,0,0,0);else{const i=id(t.path,t.distance),s=t.path.terrain?t.path.terrain.height(i.x,i.z)+t.path.y:t.path.y;this.compose(i.x-i.dz*1.2,s+.04,i.z+i.dx*1.2,Math.atan2(-i.dz,i.dx),1,1,1)}this.carMesh.setMatrixAt(e,this.matrix)}setScaffoldVisible(t){this.scaffoldMesh.visible=t}hideOverlaysForPhoto(){const t=this.labels.map(i=>i.visible),e=[this.hoverRing.visible,this.selectRing.visible],n=this.scaffoldMesh.visible;this.scaffoldMesh.visible=!1;for(const i of this.labels)i.visible=!1;return this.hoverRing.visible=!1,this.selectRing.visible=!1,()=>{this.labels.forEach((i,s)=>{i.visible=t[s]}),this.hoverRing.visible=e[0],this.selectRing.visible=e[1],this.scaffoldMesh.visible=n}}setLabelsVisible(t){this.labelsVisible=t;for(const e of this.labels)e.visible=t}idAt(t,e){const n=this.shaftMeshes.indexOf(t);return n<0?null:this.shaftIdByInstance[n].get(e)??null}anchors(){const t=new Map;for(const[e,n]of this.runtimeById)t.set(e,{x:n.slot.x,z:n.slot.z,height:n.building.height,ground:n.groundY});return t}get cloudMaterial(){return this.cloudMesh?this.cloudMesh.material:null}get waterColors(){return this.water?this.water.material.uniforms:null}setNightGlow(t){var s,a;this.nightGlow=t;const e=Math.max(0,(t-.1)/.9),n=(a=(s=this.heroParts)==null?void 0:s.beam)==null?void 0:a.material;n&&(n.visible=e>.05,n.opacity=.22*Math.min(1,e*1.5));const i=this.nightLights;i&&(i.heads.color.setRGB(1,.78,.45).multiplyScalar(e*3.2),i.pools.color.setRGB(1,.62,.3).multiplyScalar(e*.9),i.pools.visible=e>.03,i.strips.color.setRGB(1,.7,.4).multiplyScalar(e*2.4),i.neon.color.setRGB(1,1,1).multiplyScalar(e*2.6),i.neon.visible=e>.04)}applySelfLit(t){for(const e of this.facadeUniforms)e.uSelfLit.value=t,e.uWindowGlow.value=this.nightGlow}anchorFor(t){const e=this.runtimeById.get(t);return e?{x:e.slot.x,z:e.slot.z,height:e.building.height,ground:e.groundY}:null}setHovered(t){this.hoveredId=t;const e=t?this.anchorFor(t):null;if(!e){this.hoverRing.visible=!1;return}const n=t?this.runtimeById.get(t):null,i=n?n.building.footprint*1.5:3;this.hoverRing.scale.set(i,1,i),this.hoverRing.position.set(e.x,e.ground+.18,e.z),this.hoverRing.visible=!0}setSelected(t){this.selectedId=t;const e=t?this.anchorFor(t):null;if(!e){this.selectRing.visible=!1;return}const n=t?this.runtimeById.get(t):null,i=n?n.building.footprint*1.7:3.4;this.selectRing.scale.set(i,1,i),this.selectRing.position.set(e.x,e.ground+.2,e.z),this.selectRing.visible=!0}update(t,e){this.waterUniforms.uTime.value=e,this.flagTime&&(this.flagTime.value=e),this.updateCivics(t);for(const h of this.landmarkSpinners)h.object.rotation[h.axis]+=h.speed*t;let n=!1;const i=Math.min(1,t*1.35);for(const h of this.runtimes)Math.abs(h.display-h.target)>.0012?(h.display+=(h.target-h.display)*i,this.applyConstruction(h,!1),n=!0):h.display!==h.target&&(h.display=h.target,h.settled=!0,this.applyConstruction(h,!1),n=!0);if(n||Number.isNaN(this.cursor)){for(const h of this.shaftMeshes)h.instanceMatrix.needsUpdate=!0;this.podiumMesh.instanceMatrix.needsUpdate=!0,this.decoCornerMesh.instanceMatrix.needsUpdate=!0,this.decoTrimMesh.instanceMatrix.needsUpdate=!0;for(const h of this.roofProfiles)h.instanceMatrix.needsUpdate=!0;this.gardenTreeMesh.instanceMatrix.needsUpdate=!0,this.roofMesh.instanceMatrix.needsUpdate=!0,this.neonMesh.instanceMatrix.needsUpdate=!0,this.scaffoldMesh.instanceMatrix.needsUpdate=!0,this.antennaMesh.instanceMatrix.needsUpdate=!0,this.craneMastMesh.instanceMatrix.needsUpdate=!0}for(const h of this.runtimes){if(h.craneArm<0||h.display<=.002||h.craneX===0&&h.craneZ===0)continue;const d=(.25+h.building.busyness*.85)*t;h.cranePhase+=d;const u=h.building.height*1.02+6.5,f=h.craneX,m=h.craneZ;if(this.applyCraneArm(h,f,m,h.groundY,u,0),this.craneArmMesh.instanceMatrix.needsUpdate=!0,h.beacon>=0){const _=.55+.45*Math.sin(e*2.4+h.blinkPhase);this.compose(f,h.groundY+u+.3,m,0,_,_,_),this.beaconMesh.setMatrixAt(h.beacon,this.matrix),this.beaconMesh.instanceMatrix.needsUpdate=!0}}let s=!1;this.cars.forEach((h,d)=>{h.speed!==0&&(h.distance+=h.speed*t,this.placeCar(h,d,!0),s=!0)}),s&&(this.carMesh.instanceMatrix.needsUpdate=!0);let a=0;this.boats.forEach((h,d)=>{h.distance+=h.speed*t;const u=id(h.path,h.distance),f=Math.sin(e*.9+h.phase)*.12;if(this.compose(u.x,-.3+f,u.z,Math.atan2(-u.dz,u.dx),1,1,1),this.boatMesh.setMatrixAt(d,this.matrix),h.wakeTimer-=t,h.wakeTimer<=0){h.wakeTimer=.3+.08*Math.sin(e*1.7+h.phase);const m=this.wakes[a];a=(a+1)%this.wakes.length;const _=Math.sin(e*5.3+h.phase+d);m.x=u.x-u.dx*6.4-u.dz*_*1.6,m.z=u.z-u.dz*6.4+u.dx*_*1.6,m.birth=e,m.driftX=-u.dx*.5-u.dz*_*.35,m.driftZ=-u.dz*.5+u.dx*_*.35}}),this.boatMesh.instanceMatrix.needsUpdate=!0;let o=!1;for(let h=0;h<this.wakes.length;h+=1){const d=this.wakes[h];if(d.birth<0)continue;const u=e-d.birth;u>2.8?(d.birth=-1,this.compose(0,-60,0,0,1e-4,1e-4,1e-4)):(d.x+=d.driftX*t,d.z+=d.driftZ*t,this.compose(d.x,-.44,d.z,u*.5,1.1+u*2.3,1,1.1+u*2.3)),this.wakeMesh.setMatrixAt(h,this.matrix),o=!0}o&&(this.wakeMesh.instanceMatrix.needsUpdate=!0);const l=this.layout.boundsRadius+60;this.clouds.forEach((h,d)=>{h.x+=h.speed*t,h.x>l&&(h.x=-l);const u=9.5*h.scale;this.compose(h.x,h.y,h.z,0,u*1.6,u*.34,u*.8),this.cloudMesh.setMatrixAt(d,this.matrix)}),this.cloudMesh.visible&&(this.cloudMesh.instanceMatrix.needsUpdate=!0);for(const h of this.anomalyMarkers){h.mesh.position.y=h.baseY+Math.sin(e*1.4+h.phase)*.6,h.mesh.rotation.y=e*.9+h.phase,h.mesh.rotation.x=Math.sin(e*.7+h.phase)*.18;const d=.86+.14*Math.sin(e*2.6+h.phase);h.ring.scale.set(d,1,d),h.ring.material.opacity=.32+.3*(.5+.5*Math.sin(e*2.6+h.phase))}const c=.55+.3*(.5+.5*Math.sin(e*3.2));return this.hoverRing.visible&&(this.hoverRing.material.opacity=c),this.selectRing.visible&&(this.selectRing.material.opacity=.6+.3*(.5+.5*Math.sin(e*2.4))),n||s}captureAnimationOrigin(){for(const t of this.cars)Ii(t,t.distance),sd(t);for(const t of this.boats)Ii(t,t.distance);for(const t of this.clouds)Ii(t,t.x);for(const t of this.landmarkSpinners)Ii(t,t.object.rotation[t.axis])}resetAnimation(){for(const t of this.cars)t.distance=Ii(t,t.distance);this.applyCarDensity();for(const t of this.boats)t.distance=Ii(t,t.distance);for(const t of this.clouds)t.x=Ii(t,t.x);for(const t of this.landmarkSpinners)t.object.rotation[t.axis]=Ii(t,t.object.rotation[t.axis]);for(const t of this.runtimes)t.cranePhase=t.building.seed*Math.PI*2,t.display=t.target,t.settled=!0,this.applyConstruction(t,!1);for(const t of[...this.shaftMeshes,...this.roofProfiles,this.podiumMesh,this.decoCornerMesh,this.decoTrimMesh,this.gardenTreeMesh,this.roofMesh,this.neonMesh,this.scaffoldMesh,this.antennaMesh,this.craneMastMesh,this.craneArmMesh,this.beaconMesh])t.instanceMatrix.needsUpdate=!0;for(let t=0;t<this.civicTarget.length;t+=1)this.civicProgress[t]!==this.civicTarget[t]&&(this.civicProgress[t]=this.civicTarget[t],this.writeCivic(t))}districtAnchor(t){const e=this.layout.districts.find(n=>n.id===t);return e?{x:e.center.x,z:e.center.z,y:e.plaza.y,radius:e.radius}:null}dispose(){this.group.removeFromParent(),dn&&dn.seed===this.layout.seed&&this.group.remove(dn.group);for(const t of this.disposables)t.dispose()}}function rd(r){const t=new ve;for(const i of["position","normal","uv"]){const s=r[0].getAttribute(i);if(!s)continue;const a=new Float32Array(r.reduce((l,c)=>{var h;return l+(((h=c.getAttribute(i))==null?void 0:h.array.length)??0)},0));let o=0;for(const l of r){const c=l.getAttribute(i);c&&(a.set(c.array,o),o+=c.array.length)}t.setAttribute(i,new Pe(a,s.itemSize))}const e=[];let n=0;for(const i of r){if(i.index)for(const s of i.index.array)e.push(s+n);else for(let s=0;s<i.getAttribute("position").count;s+=1)e.push(s+n);n+=i.getAttribute("position").count}return t.setIndex(e),t}const ad={top:"#a3cee6",middle:"#cfe6ea",horizon:"#eef6ee",fog:"#dfeef2",fogNearFactor:2.1,fogFarFactor:7.5,hemiSky:"#eaf6fa",hemiGround:"#cbbfa6",hemiIntensity:.95,sunColor:"#fff3de",sunIntensity:1.55,sunAzimuth:1.05,sunElevation:.95,fillColor:"#cfe8ef",fillIntensity:.35,backColor:"#ffffff",backIntensity:.15,waterShallow:"#a5d6da",waterDeep:"#57a3b4",cloudOpacity:.88,selfLit:.05,stars:0},od={top:"#7f8fb4",middle:"#e3b07e",horizon:"#f4d9a6",fog:"#e9d6bc",fogNearFactor:1.9,fogFarFactor:7,hemiSky:"#f0dcc2",hemiGround:"#8d7c66",hemiIntensity:.72,sunColor:"#ffcf96",sunIntensity:1.05,sunAzimuth:3.35,sunElevation:.18,fillColor:"#ffd2a0",fillIntensity:.55,backColor:"#ff9a5e",backIntensity:.5,waterShallow:"#d3bd93",waterDeep:"#5f7383",cloudOpacity:.8,selfLit:.8,stars:.15},ao={top:"#141f3a",middle:"#223358",horizon:"#42598a",fog:"#1f3050",fogNearFactor:1.7,fogFarFactor:6.4,hemiSky:"#4d67a6",hemiGround:"#2b3652",hemiIntensity:.9,sunColor:"#a9bde0",sunIntensity:.32,sunAzimuth:4.4,sunElevation:.7,fillColor:"#3d5688",fillIntensity:.42,backColor:"#6b86c0",backIntensity:.45,waterShallow:"#27415e",waterDeep:"#101f33",cloudOpacity:.55,selfLit:1,stars:1},Li=[{hour:0,preset:ao},{hour:5,preset:ao},{hour:6.5,preset:od},{hour:8,preset:ad},{hour:16.5,preset:ad},{hour:18.5,preset:od},{hour:19,preset:ao},{hour:24,preset:ao}],Jy=["top","middle","horizon","fog","hemiSky","hemiGround","sunColor","fillColor","backColor","waterShallow","waterDeep"],Wc=new pt,ld=new pt,Sn={top:"",middle:"",horizon:"",fog:"",fogNearFactor:0,fogFarFactor:0,hemiSky:"",hemiGround:"",hemiIntensity:0,sunColor:"",sunIntensity:0,sunAzimuth:0,sunElevation:0,fillColor:"",fillIntensity:0,backColor:"",backIntensity:0,waterShallow:"",waterDeep:"",cloudOpacity:0,selfLit:0,stars:0};function Wn(r,t,e){return r+(t-r)*e}function jy(r){const t=(r%24+24)%24;let e=Li[0],n=Li[Li.length-1],i=0;for(let l=1;l<Li.length;l+=1)if(t>=Li[l-1].hour&&t<=Li[l].hour){e=Li[l-1],n=Li[l];const c=n.hour-e.hour||1;i=(t-e.hour)/c;break}const s=e.preset,a=n.preset,o=l=>{Wc.set(s[l]),ld.set(a[l]),Wc.lerp(ld,i),Sn[l]=`#${Wc.getHexString()}`};return Jy.forEach(o),Sn.fogNearFactor=Wn(s.fogNearFactor,a.fogNearFactor,i),Sn.fogFarFactor=Wn(s.fogFarFactor,a.fogFarFactor,i),Sn.hemiIntensity=Wn(s.hemiIntensity,a.hemiIntensity,i),Sn.sunIntensity=Wn(s.sunIntensity,a.sunIntensity,i),Sn.sunAzimuth=Wn(s.sunAzimuth,a.sunAzimuth,i),Sn.sunElevation=Wn(s.sunElevation,a.sunElevation,i),Sn.fillIntensity=Wn(s.fillIntensity,a.fillIntensity,i),Sn.backIntensity=Wn(s.backIntensity,a.backIntensity,i),Sn.cloudOpacity=Wn(s.cloudOpacity,a.cloudOpacity,i),Sn.selfLit=Wn(s.selfLit,a.selfLit,i),Sn.stars=Wn(s.stars,a.stars,i),Sn}const cd=8,Qy=48,tS=16,eS=`
uniform float uTime;
varying vec2 vUv;
varying float vWave;
varying float vHeight;
void main() {
  vUv = uv;
  vHeight = uv.y;
  vec3 pos = position;
  float wave1 = sin(pos.x * 0.6 + uTime * 0.3) * 0.4;
  float wave2 = sin(pos.x * 1.2 + uTime * 0.2 + 1.5) * 0.2;
  float wave3 = sin(pos.x * 0.3 + uTime * 0.15 + 3.0) * 0.6;
  float ripple = sin(pos.x * 3.0 + pos.y * 0.4 + uTime * 0.8) * 0.05;
  pos.z += (wave1 + wave2 + wave3 + ripple) * (0.3 + uv.y * 0.7);
  float sway = sin(pos.x * 0.25 + uTime * 0.1) * 0.3;
  pos.y += sway * uv.y;
  vWave = (wave1 + wave2) * 0.8;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`,nS=`
uniform float uTime;
uniform float uAlpha;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
varying vec2 vUv;
varying float vWave;
varying float vHeight;
void main() {
  float curtainX = sin(vUv.x * 12.0 + uTime * 0.5) * 0.5 + 0.5;
  curtainX = pow(curtainX, 2.0);
  float curtainX2 = sin(vUv.x * 8.0 - uTime * 0.3 + 2.0) * 0.5 + 0.5;
  curtainX2 = pow(curtainX2, 3.0);
  float curtain = max(curtainX * 0.8, curtainX2 * 0.5);
  float shimmer = sin(vUv.x * 30.0 + vUv.y * 8.0 + uTime * 2.0) * 0.5 + 0.5;
  shimmer = shimmer * 0.2 + 0.8;
  float bottomFade = smoothstep(0.0, 0.2, vHeight);
  float topFade = 1.0 - smoothstep(0.5, 1.0, vHeight);
  float vertFade = bottomFade * topFade;
  float edgeFade = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
  float t = vUv.y + vWave * 0.3;
  vec3 col;
  if (t < 0.4) {
    col = mix(uColor1, uColor2, t / 0.4);
  } else {
    col = mix(uColor2, uColor3, (t - 0.4) / 0.6);
  }
  col += vec3(0.1, 0.15, 0.1) * shimmer * curtain;
  float a = curtain * vertFade * edgeFade * shimmer * uAlpha;
  a *= 0.55;
  gl_FragColor = vec4(col, a);
}
`,hd=[{color1:[.1,.9,.3],color2:[.1,.7,.6],color3:[.3,.3,.9],alpha:1,tilt:.1},{color1:[.15,.8,.4],color2:[.2,.5,.8],color3:[.6,.2,.7],alpha:.8,tilt:.15},{color1:[.2,.6,.9],color2:[.4,.3,.8],color3:[.7,.15,.5],alpha:.6,tilt:-.08},{color1:[.05,.95,.35],color2:[.1,.85,.55],color3:[.15,.5,.75],alpha:.7,tilt:.2}];class iS{constructor(t,e){F(this,"group",new ze);F(this,"timeUniforms",[]);F(this,"alphaUniforms",[]);F(this,"baseAlphas",[]);F(this,"materials",[]);F(this,"geometries",[]);F(this,"night",0);this.group.renderOrder=-5;const n=e*3.4,i=e*.55,s=e*.5;for(let a=0;a<cd;a+=1){const o=hd[a%hd.length],l=a/cd*Math.PI*2,c=new Vn(s,i,Qy,tS),h={value:a*7.3},d={value:o.alpha},u=new le({vertexShader:eS,fragmentShader:nS,uniforms:{uTime:h,uAlpha:d,uColor1:{value:new L(...o.color1)},uColor2:{value:new L(...o.color2)},uColor3:{value:new L(...o.color3)}},transparent:!0,depthWrite:!1,blending:Fn,side:qe,fog:!1}),f=new Xt(c,u);f.position.set(t.x+Math.cos(l)*n,e*1.05,t.z+Math.sin(l)*n),f.rotation.y=Math.PI/2-l,f.rotation.z=o.tilt,this.group.add(f),this.timeUniforms.push(h),this.alphaUniforms.push(d),this.baseAlphas.push(o.alpha),this.materials.push(u),this.geometries.push(c)}this.group.visible=!1}setNight(t){this.night=t,this.group.visible=t>.02}reset(){for(const t of this.timeUniforms)t.value=0}update(t){for(let e=0;e<this.timeUniforms.length;e+=1)this.timeUniforms[e].value+=t,this.alphaUniforms[e].value=this.baseAlphas[e]*this.night*.8}dispose(){this.group.removeFromParent(),this.geometries.forEach(t=>t.dispose()),this.materials.forEach(t=>t.dispose())}}class sS{constructor(t,e,n,i){F(this,"material");F(this,"mesh");F(this,"timeU",{value:0});F(this,"phase");F(this,"drift");F(this,"radius");F(this,"speed");F(this,"night",0);this.center=t,this.terrainHeight=i,this.phase=n*Math.PI*2,this.radius=.55+n*.45,this.speed=.1+n*.08,this.drift={x:Math.cos(e),z:Math.sin(e)};const s=60+n*40,a=new je(11,2.6,s,20,10,!0).translate(0,s/2,0);this.material=new Te({color:14481151,transparent:!0,opacity:0,depthWrite:!1,side:qe,fog:!0}),this.material.defines={USE_UV:""},this.material.onBeforeCompile=o=>{o.uniforms.time=this.timeU,o.vertexShader=o.vertexShader.replace("#include <common>",`#include <common>
uniform float time;`).replace("#include <begin_vertex>",`#include <begin_vertex>
          // 扭转 + 摆动（参考 WaterSpouts 的顶点注入）
          float twist = uv.y * 5.0 + time * 0.6;
          float s = sin(twist);
          float c = cos(twist);
          transformed.xz = mat2(c, -s, s, c) * transformed.xz;
          transformed.x += sin(time * 1.7 + uv.y * 3.2) * 2.4 * uv.y;
          transformed.z += cos(time * 1.4 + uv.y * 3.9) * 2.4 * uv.y;`)},this.mesh=new Xt(a,this.material),this.mesh.name="city-sea-spout",this.mesh.position.set(t.x,0,t.z)}update(t,e){this.timeU.value+=t;const n=(e*this.speed+this.phase)%(Math.PI*2),i=Math.max(0,Math.sin(n));this.material.opacity=.38*i*(1-this.night*.8),this.mesh.visible=i>.03;const s=e*.03+this.phase,a=this.center.x+Math.cos(s)*18+this.drift.x*Math.sin(e*.05+this.phase)*30,o=this.center.z+Math.sin(s)*18+this.drift.z*Math.sin(e*.05+this.phase)*30;this.mesh.position.set(a,this.terrainHeight(a,o),o),this.mesh.rotation.y=e*.5+this.phase}reset(){this.timeU.value=0}dispose(){this.mesh.geometry.dispose(),this.material.dispose(),this.mesh.removeFromParent()}}class rS{constructor(t,e,n){F(this,"group",new ze);F(this,"envelope");F(this,"baseY");F(this,"rise");F(this,"sway");F(this,"t");F(this,"t0");F(this,"spawn");F(this,"geometries",[]);F(this,"materials",[]);this.t=n*120,this.t0=this.t,this.spawn={...t},this.rise=1.6+n*1.4,this.sway=.4+n*.6,this.baseY=70+n*40;const i=new yn(9,14,12).scale(1,1.18,1),s=new ie({color:e});this.envelope=new Xt(i,s),this.envelope.position.y=10,this.envelope.castShadow=!0;const a=new ae(3.4,2.6,3.4),o=new ie({color:"#8a6a4c"}),l=new Xt(a,o),c=new ae(3,5.2,3),h=new ie({color:"#5d5648",transparent:!0,opacity:.55}),d=new Xt(c,h);d.position.y=3.6,this.group.add(this.envelope,l,d),this.group.position.set(t.x,this.baseY,t.z),this.group.name="city-hot-air-balloon",this.geometries=[i,a,c],this.materials=[s,o,h]}reset(){this.t=this.t0,this.group.position.set(this.spawn.x,this.baseY,this.spawn.z),this.group.rotation.set(0,0,0)}update(t){this.t+=t,this.group.position.y=this.baseY+Math.sin(this.t*.05*this.rise)*55,this.group.position.x+=Math.sin(this.t*.03)*.16*this.sway,this.group.position.z+=Math.cos(this.t*.026)*.14*this.sway,this.group.rotation.z=Math.sin(this.t*.11)*.05,this.group.rotation.x=Math.cos(this.t*.09)*.04}dispose(){this.geometries.forEach(t=>t.dispose()),this.materials.forEach(t=>t.dispose()),this.group.removeFromParent()}}class aS{constructor(t,e,n,i=42){F(this,"mesh");F(this,"lanterns",[]);F(this,"night",0);F(this,"matrix",new It);F(this,"position",new L);F(this,"quaternion",new He);F(this,"scale",new L);F(this,"geometry");F(this,"material");const s=new yn(1.1,8,6),a=new Te({color:"#ffca7a",transparent:!0,opacity:0,toneMapped:!1});this.mesh=new De(s,a,i),this.mesh.frustumCulled=!1,this.mesh.name="city-night-lanterns",this.mesh.visible=!1;for(let o=0;o<i;o+=1){const l=Ft(`lantern:${o}`);let c,h;if(n&&n.length>4&&o%2===0){const d=n[Math.floor(l*n.length)];c=d.x+(l-.5)*26,h=d.z+(Ft(`lz:${o}`)-.5)*26}else{const d=l*Math.PI*2,u=e*(.9+Ft(`lr:${o}`)*.5);c=t.x+Math.cos(d)*u,h=t.z+Math.sin(d)*u}this.lanterns.push({x:c,z:h,y:3+l*6,y0:3+l*6,rise:.5+Ft(`lri:${o}`)*.9,drift:l*Math.PI*2,phase:l*Math.PI*2})}this.geometry=s,this.material=a}setNight(t){this.night=t,this.material.opacity=.9*t,this.mesh.visible=t>.03}reset(){for(const t of this.lanterns)t.y=t.y0}update(t,e){this.lanterns.forEach((n,i)=>{n.y+=n.rise*t*1.6,n.y>90&&(n.y=2.5);const s=Math.sin(e*.5+n.phase)*.8;this.position.set(n.x+Math.sin(e*.04+n.drift)*9,n.y+s,n.z+Math.cos(e*.05+n.drift)*9);const a=.8+.25*Math.sin(e*1.6+n.phase);this.scale.setScalar(a),this.quaternion.identity(),this.matrix.compose(this.position,this.quaternion,this.scale),this.mesh.setMatrixAt(i,this.matrix)}),this.mesh.instanceMatrix.needsUpdate=!0}dispose(){this.geometry.dispose(),this.material.dispose(),this.mesh.removeFromParent()}}class oS{constructor(t,e,n,i){F(this,"spouts",[]);F(this,"balloons",[]);F(this,"lanterns",null);F(this,"group",new ze);for(let a=0;a<2;a+=1){const o=a*2.4+.7;let l=e*1.55;const c=d=>{for(let u=0;u<8;u+=1){const f=u/8*Math.PI*2;if(n(t.x+Math.cos(o)*d+Math.cos(f)*50,t.z+Math.sin(o)*d+Math.sin(f)*50)>-.5)return!0}return n(t.x+Math.cos(o)*d,t.z+Math.sin(o)*d)>-.5};for(;c(l)&&l<e*6;)l+=20;const h=new sS({x:t.x+Math.cos(o)*l,z:t.z+Math.sin(o)*l},o,Ft(`spout:${a}`),n);this.spouts.push(h),this.group.add(h.mesh)}const s=["#d96a4e","#4e96b8","#d9a94e"];for(let a=0;a<3;a+=1){const o=Ft(`balloon:${a}`),l=a/3*Math.PI*2+o*.9,c=e*(.5+(a*.37+o)%1*.45),h=new rS({x:t.x+Math.cos(l)*c,z:t.z+Math.sin(l)*c},s[a],o);this.balloons.push(h),this.group.add(h.group)}this.lanterns=new aS(t,e,i),this.group.add(this.lanterns.mesh)}setNight(t){var e;(e=this.lanterns)==null||e.setNight(t);for(const n of this.spouts)n.night=t,n.mesh.material.color.setRGB(.86,.96,1).multiplyScalar(1-t*.75)}reset(){var t;this.spouts.forEach(e=>e.reset()),this.balloons.forEach(e=>e.reset()),(t=this.lanterns)==null||t.reset()}update(t,e){var n;for(const i of this.spouts)i.update(t,e);for(const i of this.balloons)i.update(t);(n=this.lanterns)==null||n.update(t,e)}dispose(){var t;this.spouts.forEach(e=>e.dispose()),this.balloons.forEach(e=>e.dispose()),(t=this.lanterns)==null||t.dispose(),this.group.removeFromParent()}}class lS{constructor(t,e){F(this,"bodyMesh");F(this,"wingMesh");F(this,"bodyMaterial");F(this,"wingMaterial");F(this,"flocks",[]);F(this,"offsets");F(this,"matrix",new It);F(this,"wingMatrix",new It);F(this,"birdQuaternion",new He);F(this,"wingQuaternion",new He);F(this,"flapQuaternion",new He);F(this,"euler",new Tn);F(this,"position",new L);F(this,"scaleVector",new L);F(this,"mirror",new It().makeScale(1,1,-1));F(this,"axisX",new L(1,0,0));F(this,"center");F(this,"group",new ze);F(this,"daylight",1);this.center={...t};const n=new yn(.3,6,5).scale(2.4,.85,.8),i=new Rn(.3,.85,4).rotateZ(Math.PI/2).translate(-.95,.02,0).scale(1,.16,1),s=bc([n,i]);n.dispose(),i.dispose();const a=new yu;a.moveTo(0,0),a.lineTo(-.45,1.55),a.lineTo(-1,1.9),a.lineTo(-.55,.2),a.closePath();const o=new nc(a).rotateX(Math.PI/2);this.bodyMaterial=new ie({color:"#454b52",transparent:!0}),this.wingMaterial=new ie({color:"#3d434a",transparent:!0,side:qe}),this.offsets=[[0,0],[-.13,-.085],[-.13,.085],[-.26,-.17],[-.26,.17],[-.39,-.25],[-.39,.25]].map(([c,h])=>[c*30,h*30]);const l=this.offsets.length*2;this.bodyMesh=new De(s,this.bodyMaterial,l),this.bodyMesh.name="city-birds",this.wingMesh=new De(o,this.wingMaterial,l*2),this.wingMesh.name="city-bird-wings",this.bodyMesh.frustumCulled=!1,this.wingMesh.frustumCulled=!1,this.wingMesh.instanceMatrix.setUsage(Si),this.group.add(this.bodyMesh,this.wingMesh);for(let c=0;c<2;c+=1){const h=Ft(`flock:${c}`);this.flocks.push({orbit:h*Math.PI*2,radius:e*(.35+h*.4),altitude:70+h*50,speed:(.05+h*.018)*(c===0?1:-1),phase:h*7,bob:.55+h*.4})}}setDaylight(t){this.daylight=t,this.bodyMaterial.opacity=.92*t,this.wingMaterial.opacity=.92*t,this.group.visible=t>.05}update(t,e){if(!this.group.visible)return;let n=0;for(const i of this.flocks){const s=i.orbit+e*i.speed;for(const[a,o]of this.offsets){const l=s-Math.sign(i.speed)*a/i.radius,c=this.center.x+Math.cos(l)*(i.radius+o*Math.sin(l)),h=this.center.z+Math.sin(l)*(i.radius+o*-Math.cos(l)),d=Math.sin(e*8.5+i.phase+a*1.9+o*3.1),f=.12+(.1+.85*(.25+.75*(.5+.5*Math.sin(e*.31+i.phase+o))))*d;this.position.set(c,i.altitude+d*i.bob,h),this.euler.set(d*.12,-s-Math.sign(i.speed)*Math.PI/2,d*.18),this.birdQuaternion.setFromEuler(this.euler),this.scaleVector.setScalar(3*(.92+d*.06)),this.matrix.compose(this.position,this.birdQuaternion,this.scaleVector),this.bodyMesh.setMatrixAt(n,this.matrix),this.flapQuaternion.setFromAxisAngle(this.axisX,f),this.wingQuaternion.copy(this.birdQuaternion).multiply(this.flapQuaternion),this.wingMatrix.compose(this.position,this.wingQuaternion,this.scaleVector),this.wingMesh.setMatrixAt(n*2,this.wingMatrix),this.flapQuaternion.setFromAxisAngle(this.axisX,-f),this.wingQuaternion.copy(this.birdQuaternion).multiply(this.flapQuaternion),this.wingMatrix.compose(this.position,this.wingQuaternion,this.scaleVector),this.wingMatrix.multiply(this.mirror),this.wingMesh.setMatrixAt(n*2+1,this.wingMatrix),n+=1}}this.bodyMesh.instanceMatrix.needsUpdate=!0,this.wingMesh.instanceMatrix.needsUpdate=!0}dispose(){this.bodyMesh.geometry.dispose(),this.wingMesh.geometry.dispose(),this.bodyMaterial.dispose(),this.wingMaterial.dispose(),this.group.removeFromParent()}}const ud=`
float hash3(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0,0.0,0.0)), f.x),
        mix(hash3(i + vec3(0.0,1.0,0.0)), hash3(i + vec3(1.0,1.0,0.0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0.0,0.0,1.0)), hash3(i + vec3(1.0,0.0,1.0)), f.x),
        mix(hash3(i + vec3(0.0,1.0,1.0)), hash3(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
}
`,cS=`
uniform float uTime;
uniform float uOpacity;
varying vec3 vPos;
${ud}
void main() {
  float n = noise3(vPos * 2.2 + uTime * 3.0);
  float crack = smoothstep(0.35, 0.6, n);
  vec3 rock = vec3(0.08, 0.03, 0.01);
  vec3 lava = mix(vec3(1.0, 0.2, 0.0), vec3(1.0, 0.9, 0.2), crack);
  gl_FragColor = vec4(mix(rock, lava, crack * 0.8 + 0.2), uOpacity);
}
`,hS=`
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
${ud}
void main() {
  float fade = 1.0 - vUv.y;
  float n = noise3(vec3(vUv.x * 12.0, vUv.y * 6.0 - uTime * 15.0, uTime * 2.0));
  float core = smoothstep(0.2, 0.8, fade) * smoothstep(0.1, 0.9, n);
  vec3 fireCol = mix(vec3(1.0, 0.2, 0.0), vec3(1.0, 0.9, 0.3), core);
  vec3 smokeCol = vec3(0.08, 0.08, 0.08);
  float fireMix = smoothstep(0.3, 0.8, fade + n * 0.2);
  vec3 col = mix(smokeCol, fireCol, fireMix);
  float alpha = smoothstep(0.0, 0.2, fade) * n * uOpacity;
  alpha = clamp(mix(alpha * 1.5, alpha, fireMix), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;class uS{constructor(t,e={x:0,z:0}){F(this,"pool",[]);F(this,"trailMaterial");F(this,"headMaterial");F(this,"glowMaterial");F(this,"geometries",[]);F(this,"timeU",{value:0});F(this,"countdown",3);F(this,"interval",1.2);F(this,"night",0);F(this,"spawnCount",0);F(this,"group",new ze);this.radius=t,this.center=e;const n=new Rn(2.4,70,16,4,!0).rotateX(-Math.PI/2).translate(0,0,-35),i=new Da(2.2,1),s=i.attributes.position;for(let o=0;o<s.count;o+=1){const l=1+(Ft(`meteor-rock:${o}`)-.5)*.1;s.setXYZ(o,s.getX(o)*l,s.getY(o)*l,s.getZ(o)*l)}i.computeVertexNormals();const a=new yn(5.5,12,8);this.geometries.push(n,i,a),this.trailMaterial=new le({vertexShader:`varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,fragmentShader:hS,uniforms:{uTime:this.timeU,uOpacity:{value:1}},transparent:!0,depthWrite:!1,side:qe,fog:!1}),this.headMaterial=new le({vertexShader:`varying vec3 vPos;
void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,fragmentShader:cS,uniforms:{uTime:this.timeU,uOpacity:{value:1}},transparent:!0,fog:!1}),this.glowMaterial=new Te({color:"#ffba73",transparent:!0,opacity:.35,depthWrite:!1,blending:Fn,toneMapped:!1,fog:!1});for(let o=0;o<3;o+=1){const l=new ze,c=new Xt(n,this.trailMaterial);c.renderOrder=335;const h=new Xt(i,this.headMaterial);h.renderOrder=340;const d=new Xt(a,this.glowMaterial);d.renderOrder=330;for(const u of[c,h,d])u.frustumCulled=!1;l.add(c,d,h),l.visible=!1,this.group.add(l),this.pool.push({mesh:l,active:!1,life:0,span:2.6,velocity:new L})}}reset(){this.countdown=3,this.spawnCount=0,this.timeU.value=0;for(const t of this.pool)t.active=!1,t.life=0,t.mesh.visible=!1}setNight(t,e){this.night=t;const n=Math.floor(e/864e5),i=Ft(`meteor-night:${n}`)<.3;this.interval=i?1.35:7.5}update(t){this.timeU.value+=t;const e=this.night>.55;if(this.group.visible=e,!e){for(const n of this.pool)n.mesh.visible=!1;return}if(this.countdown-=t,this.countdown<=0){const n=this.pool.find(i=>!i.active);if(n){const i=Ft(`meteor-spawn:${this.spawnCount}`);this.spawnCount+=1;const s=this.radius*(1.15+i*.5),a=i*Math.PI*2;n.mesh.position.set(this.center.x+Math.cos(a)*s,560+i*220,this.center.z+Math.sin(a)*s),n.velocity.set(-Math.cos(a)*150-60,-95-i*45,-Math.sin(a)*150+40).normalize().multiplyScalar(230+i*70),n.span=2.2+i*1.1,n.life=0,n.active=!0,n.mesh.visible=!0}this.countdown=this.interval*(.7+Ft(`meteor-gap:${this.spawnCount}`)*.6)}for(const n of this.pool){if(!n.active)continue;n.life+=t;const i=n.life/n.span;if(i>=1){n.active=!1,n.mesh.visible=!1;continue}n.mesh.position.addScaledVector(n.velocity,t);const s=Math.sin(i*Math.PI);n.mesh.scale.setScalar(.5+s*.8),n.mesh.lookAt(n.mesh.position.clone().add(n.velocity))}}dispose(){this.geometries.forEach(t=>t.dispose()),this.trailMaterial.dispose(),this.headMaterial.dispose(),this.glowMaterial.dispose(),this.group.removeFromParent()}}class fS{constructor(t){F(this,"puffs");F(this,"material");F(this,"lifeAttr");F(this,"nightU",{value:0});F(this,"glow");F(this,"glowMaterial");F(this,"crater");F(this,"wind",new L(4.2,0,2.6));F(this,"ages",[]);F(this,"spans",[]);F(this,"group",new ze);this.crater=new L(t.center.x,t.height/2,t.center.z);const e=new Vn(1,1);this.lifeAttr=new Vi(new Float32Array(11),1),e.setAttribute("aLife",this.lifeAttr),this.material=new le({transparent:!0,depthWrite:!1,uniforms:{uOpacity:{value:1},uNight:this.nightU},vertexShader:`
        attribute float aLife;
        varying vec2 vUv;
        varying float vLife;
        void main() {
          vUv = uv;
          vLife = aLife;
          vec4 instancePos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec4 mvPos = modelViewMatrix * instancePos;
          float scaleX = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
          float scaleY = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
          mvPos.xy += position.xy * vec2(scaleX, scaleY);
          gl_Position = projectionMatrix * mvPos;
        }`,fragmentShader:`
        uniform float uOpacity;
        uniform float uNight;
        varying vec2 vUv;
        varying float vLife;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          vec3 inner = mix(vec3(0.42, 0.43, 0.45), vec3(0.6, 0.12, 0.03), uNight * (1.0 - vLife));
          vec3 outer = mix(vec3(0.33, 0.34, 0.37), vec3(0.18, 0.12, 0.12), uNight);
          vec3 col = mix(inner, outer, smoothstep(0.0, 0.8, d));
          float lifeFade = smoothstep(0.0, 0.15, vLife) * (1.0 - smoothstep(0.5, 1.0, vLife));
          float alpha = (1.0 - smoothstep(0.3, 1.0, d)) * uOpacity * lifeFade;
          gl_FragColor = vec4(col * 1.2, alpha * 0.7); // 原版 0.45 是暗夜背景；白天浅色天空上要更实一点
        }`}),this.puffs=new De(e,this.material,11),this.puffs.frustumCulled=!1,this.puffs.onBeforeRender=(n,i)=>{i.overrideMaterial&&(this.puffs.count=0)},this.puffs.onAfterRender=()=>{this.puffs.count=11},this.puffs.name="city-volcano-plume";for(let n=0;n<11;n+=1){const i=8+n%4*1.3+Ft(`puffspan:${n}`)*.6;this.spans.push(i),this.ages.push((n/11+Ft(`puff:${n}`)*.04)*i)}this.glowMaterial=new Te({color:"#ff5a2e",transparent:!0,opacity:0,blending:Fn,depthWrite:!1,fog:!1,toneMapped:!1}),this.glow=new Xt(new yn(4.5,8,6),this.glowMaterial),this.glow.position.copy(this.crater),this.group.add(this.puffs,this.glow)}setNight(t){this.glowMaterial.opacity=t*.3,this.nightU.value=t}reset(){for(let t=0;t<this.ages.length;t+=1)this.ages[t]=(t/11+Ft(`puff:${t}`)*.04)*this.spans[t]}update(t){const e=new It,n=new L,i=new L;for(let s=0;s<this.ages.length;s+=1){this.ages[s]=(this.ages[s]+Math.min(t,.5))%this.spans[s];const a=this.ages[s]/this.spans[s],o=a*58;n.copy(this.crater).addScaledVector(this.wind,a*this.spans[s]),n.y+=o;const l=Math.sin(s*2.399)*a*14;n.x+=l*.8,n.z+=Math.cos(s*2.399)*a*14*.8;const c=9+a*34;i.set(c,c,1),this.lifeAttr.setX(s,a),e.compose(n,new He,i),this.puffs.setMatrixAt(s,e)}this.puffs.instanceMatrix.needsUpdate=!0,this.lifeAttr.needsUpdate=!0}dispose(){this.puffs.geometry.dispose(),this.material.dispose(),this.glow.geometry.dispose(),this.glowMaterial.dispose(),this.group.removeFromParent()}}class dS{constructor(t,e=130){F(this,"material");F(this,"timeU",{value:0});F(this,"nightU",{value:0});F(this,"points");const n=[];for(let o=0;o<e&&o<t.length;o+=1){const l=t[o%t.length];n.push({...l,seed:Ft(`fireflyphase:${o}`)})}const i=new Float32Array(n.length*3),s=new Float32Array(n.length);n.forEach((o,l)=>{i[l*3]=o.x+(o.seed-.5)*6,i[l*3+1]=o.y+1.4+o.seed*2.2,i[l*3+2]=o.z+(Ft(`fireflyz:${l}`)-.5)*6,s[l]=o.seed*Math.PI*2});const a=new ve;a.setAttribute("position",new Pe(i,3)),a.setAttribute("aPhase",new Pe(s,1)),this.material=new le({transparent:!0,depthWrite:!1,blending:Fn,uniforms:{uTime:this.timeU,uNight:this.nightU},vertexShader:`
        attribute float aPhase;
        uniform float uTime;
        varying float vGlow;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float blink = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * (1.4 + aPhase * 0.22) + aPhase * 6.28), 3.0);
          float drift = sin(uTime * 0.6 + aPhase * 4.0) * 0.5;
          mvPosition.y += drift;
          vGlow = blink;
          // ×4：50 单位外原来只有 ~2px，等于看不见（审计夜景公园里一只都找不到）；近处封顶 28px。
          gl_PointSize = min(28.0, (240.0 + blink * 184.0) / max(1.0, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }`,fragmentShader:`
        uniform float uNight;
        varying float vGlow;
        void main() {
          float falloff = 1.0 - smoothstep(0.15, 0.5, length(gl_PointCoord - vec2(0.5)));
          vec3 warm = mix(vec3(0.82, 0.95, 0.45), vec3(1.0, 0.92, 0.5), vGlow);
          gl_FragColor = vec4(warm, vGlow * falloff * uNight);
        }`}),this.points=new lu(a,this.material),this.points.name="city-fireflies",this.points.frustumCulled=!1}setNight(t){this.nightU.value=Math.max(0,Math.min(1,(t-.06)/.2))*(1-t*.35)}update(t,e){this.timeU.value=e}dispose(){this.points.geometry.dispose(),this.material.dispose(),this.points.removeFromParent()}}class pS{constructor(t,e,n=220){F(this,"mesh");F(this,"material");F(this,"walkers",[]);F(this,"matrix",new It);F(this,"quaternion",new He);F(this,"euler",new Tn);F(this,"position",new L);F(this,"scaleVector",new L);F(this,"color",new pt);F(this,"ground");F(this,"group",new ze);this.ground=e;const i=new je(.26,.34,1.35,5).translate(0,.68,0),s=new yn(.21,6,5).translate(0,1.58,0),a=bc([i,s]);i.dispose(),s.dispose(),this.material=new ie({color:"#ffffff"}),this.mesh=new De(a,this.material,Math.max(1,n)),this.mesh.name="city-pedestrians",this.mesh.instanceMatrix.setUsage(Si),this.mesh.frustumCulled=!1;const o=["#d8d3c8","#b8c4cc","#c9a08a","#8f9aa4","#d9b48a","#7f8b94","#c8ccd0"];let l=0;t.forEach((c,h)=>{if(c.length<3||l>=n)return;const d=c.reduce((g,v)=>g+v.x,0)/c.length,u=c.reduce((g,v)=>g+v.z,0)/c.length,f=c.map(g=>{const v=d-g.x,M=u-g.z,x=Math.hypot(v,M)||1;return{x:g.x+v/x*3.2,z:g.z+M/x*3.2}}),m=[0];for(let g=1;g<=f.length;g+=1){const v=f[g-1],M=f[g%f.length];m.push(m[g-1]+Math.hypot(M.x-v.x,M.z-v.z))}const _=m[m.length-1];if(_<40)return;const p=Math.min(16,Math.max(6,Math.round(_/55)));for(let g=0;g<p&&l<n;g+=1){const v=Ft(`ped:${h}:${g}`);this.walkers.push({points:f,cumulative:m,total:_,distance:v*_,speed:(v>.5?1:-1)*(1.15+Ft(`peds:${h}:${g}`)*.75),phase:Ft(`pedp:${h}:${g}`)*Math.PI*2}),this.mesh.setColorAt(l,this.color.set(o[Math.floor(Ft(`pedc:${h}:${g}`)*o.length)])),l+=1}}),this.mesh.count=l}update(t,e){if(this.walkers.length){for(let n=0;n<this.walkers.length;n+=1){const i=this.walkers[n],s=((i.distance+i.speed*e)%i.total+i.total)%i.total;let a=1;for(;a<i.cumulative.length-1&&i.cumulative[a]<s;)a+=1;const o=i.points[a-1],l=i.points[a%i.points.length],c=i.cumulative[a]-i.cumulative[a-1]||1,h=(s-i.cumulative[a-1])/c,d=o.x+(l.x-o.x)*h,u=o.z+(l.z-o.z)*h,f=Math.abs(Math.sin(e*6+i.phase))*.05;this.position.set(d,this.ground(d,u)+f,u),this.euler.set(0,Math.atan2(-(l.z-o.z),l.x-o.x),0),this.quaternion.setFromEuler(this.euler),this.scaleVector.set(1,1,1),this.matrix.compose(this.position,this.quaternion,this.scaleVector),this.mesh.setMatrixAt(n,this.matrix)}this.mesh.instanceMatrix.needsUpdate=!0}}dispose(){this.mesh.geometry.dispose(),this.material.dispose(),this.group.removeFromParent()}get object3d(){return this.mesh}}class mS{constructor(t,e,n,i,s,a){F(this,"birds");F(this,"meteors");F(this,"volcano");F(this,"fireflies");F(this,"pedestrians");F(this,"group",new ze);this.birds=new lS(t,e),this.group.add(this.birds.group),this.meteors=new uS(e,t),this.group.add(this.meteors.group);const o=[...i].sort((l,c)=>c.height-l.height)[0];this.volcano=o?new fS(o):null,this.volcano&&this.group.add(this.volcano.group),this.fireflies=n.length?new dS(n):null,this.fireflies&&this.group.add(this.fireflies.points),this.pedestrians=s.length?new pS(s,a):null,this.pedestrians&&this.group.add(this.pedestrians.object3d)}setNight(t,e){var n,i;this.birds.setDaylight(1-t),this.meteors.setNight(t,e),(n=this.volcano)==null||n.setNight(t),(i=this.fireflies)==null||i.setNight(t)}reset(){var t;this.meteors.reset(),(t=this.volcano)==null||t.reset()}update(t,e){var n,i,s;this.birds.update(t,e),this.meteors.update(t),(n=this.volcano)==null||n.update(t),(i=this.fireflies)==null||i.update(t,e),(s=this.pedestrians)==null||s.update(t,e)}dispose(){var t,e,n;this.birds.dispose(),this.meteors.dispose(),(t=this.volcano)==null||t.dispose(),(e=this.fireflies)==null||e.dispose(),(n=this.pedestrians)==null||n.dispose(),this.group.removeFromParent()}}const fd=.82,gS=.62;function xS(r){const t=r-new Date(r).getTimezoneOffset()*6e4,e=Math.floor(t/864e5),n=t/36e5%24,i=Ft(`weather:${(Math.imul(e,2654435761)^2654435769)>>>0}`),s=i<gS?"clear":i<fd?"overcast":"rain",a=Math.max(0,Math.min(1,Math.min(n/1.5,(24-n)/1.5))),o=Ft(`rainphase:${e}`)*100,l=Math.sin(n*3.7+o*1.7)*.5+.5,c=Math.sin(n*1.6+o*3.1)*.5+.5,h=l*.65+c*.35,d=Math.max(0,Math.min(1,(h-.5)/.08)),u=.25+.75*d*d*(3-2*d),f=s==="clear"?0:s==="rain"?a*u:a,m=s==="clear"?0:a*(s==="rain"?1:.72),_=Ft(`weather:${(Math.imul(e-1,2654435761)^2654435769)>>>0}`)>=fd,p=Math.max(0,Math.min(1,(n-6)/1.5)),g=_&&Ft(`bow:${e}`)<.5?p*Math.max(0,Math.min(1,(11-n)/2.5)):0;return{kind:s,intensity:f,overcast:m,rainbow:g}}const Xc=50,vS=.09;function $i(r){const t=Math.sin(r*127.1+311.7)*43758.5453;return t-Math.floor(t)}class _S{constructor(){F(this,"mesh");F(this,"uniforms");F(this,"streaks",Array.from({length:Xc},()=>({x:0,y:0,speed:0,length:0,width:0,angle:0,active:!1})));F(this,"amount",0);F(this,"spawnCount",0);F(this,"frame",0);F(this,"matrix",new It);F(this,"position",new L);F(this,"quaternion",new He);F(this,"scale",new L);F(this,"zAxis",new L(0,0,1));this.uniforms={uOpacity:{value:0},uAspect:{value:1}};const t=new le({transparent:!0,depthTest:!1,depthWrite:!1,side:qe,blending:Fn,uniforms:this.uniforms,vertexShader:`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          // 实例矩阵直接给出 NDC（-1..1）里的位置/朝向/尺寸：雨线贴屏幕，不随相机透视。
          gl_Position = vec4((instanceMatrix * vec4(position, 1.0)).xy, 0.0, 1.0);
        }`,fragmentShader:`
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float along = vUv.y;
          float taper = smoothstep(0.0, 0.15, along) * smoothstep(1.0, 0.7, along);
          float across = abs(vUv.x - 0.5) * 2.0;
          float shape = (1.0 - smoothstep(0.0, 1.0, across)) * taper;
          gl_FragColor = vec4(0.75, 0.8, 0.88, shape * uOpacity);
        }`});this.mesh=new De(new Vn(1,1),t,Xc),this.mesh.name="city-rain",this.mesh.renderOrder=90,this.mesh.frustumCulled=!1,this.mesh.visible=!1,this.mesh.count=0}setAspect(t,e){this.uniforms.uAspect.value=Math.max(.2,t/Math.max(1,e))}setAmount(t){if(this.amount=t,this.uniforms.uOpacity.value=t*.35,this.mesh.visible=t>.02,!this.mesh.visible)for(const e of this.streaks)e.active=!1}reset(){this.spawnCount=0,this.frame=0;for(const t of this.streaks)t.active=!1}spawn(t){const e=this.spawnCount*6;this.spawnCount+=1,t.angle=-.35+($i(e)-.5)*2*vS,t.length=.08+$i(e+1)*.14,t.width=.0015+$i(e+2)*.0015,t.speed=1.8+$i(e+3)*1.4,t.x=($i(e+4)-.5)*2.6,t.y=1.15+$i(e+5)*.3,t.active=!0}update(t,e,n){if(!this.mesh.visible)return;const i=Math.min(t,.1);this.frame+=1;let s=0;for(let a=0;a<Xc;a+=1){const o=this.streaks[a];if(!o.active)if($i(this.frame*53.7+a*1.31+.5)<this.amount*.85*i*30)this.spawn(o);else continue;if(o.x+=Math.sin(o.angle)*o.speed*i,o.y-=Math.cos(o.angle)*o.speed*i,o.y<-1.3){o.active=!1;continue}this.position.set(o.x,o.y,0),this.quaternion.setFromAxisAngle(this.zAxis,o.angle),this.scale.set(o.width/this.uniforms.uAspect.value,o.length,1),this.matrix.compose(this.position,this.quaternion,this.scale),this.mesh.setMatrixAt(s,this.matrix),s+=1}this.mesh.count=s,this.mesh.instanceMatrix.needsUpdate=!0}dispose(){this.mesh.geometry.dispose(),this.mesh.material.dispose(),this.mesh.removeFromParent()}}class MS{constructor(t){F(this,"mesh");F(this,"uniforms");this.uniforms={uOpacity:{value:0},uInner:{value:t*.78},uOuter:{value:t}};const e=new le({transparent:!0,depthWrite:!1,side:qe,blending:ji,uniforms:this.uniforms,vertexShader:`
        varying float vRadius;
        varying float vArc;
        void main() {
          vRadius = length(position.xy);
          vArc = atan(position.y, position.x) / 3.14159265; // 0 = 右脚, 1 = 左脚
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,fragmentShader:`
        uniform float uOpacity;
        uniform float uInner;
        uniform float uOuter;
        varying float vRadius;
        varying float vArc;
        vec3 band(float t) {
          // t = 0 → 紫，1 → 红。
          vec3 spectrum[6] = vec3[6](
            vec3(0.5, 0.2, 0.85), vec3(0.15, 0.35, 0.95), vec3(0.1, 0.75, 0.9),
            vec3(0.2, 0.85, 0.3), vec3(1.0, 0.85, 0.1), vec3(1.0, 0.25, 0.15)
          );
          float f = clamp(t, 0.0, 1.0) * 5.0;
          int i = int(f);
          return mix(spectrum[i], spectrum[min(i + 1, 5)], fract(f));
        }
        void main() {
          // 光谱沿半径展开（真实主虹：内缘紫 → 外缘红）。曾用 RingGeometry 的 uv.y——那是包围盒上的平面坐标、
          // 自下而上贯穿整道弧，不是环带宽度方向：颜色被拉满整个弧高，环带内几乎是同一种色。
          float t = clamp((vRadius - uInner) / (uOuter - uInner), 0.0, 1.0);
          float edge = smoothstep(0.0, 0.18, t) * smoothstep(1.0, 0.82, t);
          // 两脚淡出（原版 groundFade = sin(u·π)）：曾在海平面处硬切。不透明度只在 set() 里乘一次 0.55
          // ——曾在这里再乘一次，峰值只有原版的一半。
          float groundFade = sin(clamp(vArc, 0.0, 1.0) * 3.14159265);
          gl_FragColor = vec4(band(t), edge * groundFade * uOpacity);
        }`}),n=new Rr(t*.78,t,48,1,0,Math.PI);this.mesh=new Xt(n,e),this.mesh.name="city-rainbow",this.mesh.frustumCulled=!1,this.mesh.visible=!1}set(t,e,n,i){if(this.uniforms.uOpacity.value=t*.55,this.mesh.visible=t>.02,!this.mesh.visible)return;const s=e+Math.PI;this.mesh.position.set(n.x+Math.cos(s)*i,-18,n.z+Math.sin(s)*i),this.mesh.lookAt(n.x,this.mesh.position.y,n.z)}dispose(){this.mesh.geometry.dispose(),this.mesh.material.dispose(),this.mesh.removeFromParent()}}const dd=15,yS=19.6,SS=12e3,bS=50;class wS{constructor(t){F(this,"renderer");F(this,"scene",new Rp);F(this,"camera");F(this,"controls");F(this,"assetsReady");F(this,"floraReady",Promise.resolve());F(this,"hemisphere");F(this,"sun");F(this,"raycaster",new c0);F(this,"pointer",new ft);F(this,"parts",null);F(this,"layout",null);F(this,"model",null);F(this,"frame",0);F(this,"raf",0);F(this,"lastTime",0);F(this,"elapsed",0);F(this,"lastRenderAt",0);F(this,"disposed",!1);F(this,"documentHidden",!1);F(this,"firstFrameSent",!1);F(this,"cursorMs",null);F(this,"lastSkyHour",-1);F(this,"aurora",null);F(this,"ambient",null);F(this,"wildlife",null);F(this,"rain",null);F(this,"rainbow",null);F(this,"fillLight",null);F(this,"backLight",null);F(this,"themeSelfLit",.24);F(this,"playing",!1);F(this,"playbackSpeed",3600);F(this,"lastActivityAt",0);F(this,"qualityMode","auto");F(this,"quality",0);F(this,"frameCount",0);F(this,"lastStatsAt",0);F(this,"fps",60);F(this,"softwareRenderer",!1);F(this,"surfaceDirty",!0);F(this,"qualityDirty",!0);F(this,"surfaceWidth",0);F(this,"surfaceHeight",0);F(this,"surfacePixelRatio",0);F(this,"lastSurfaceChangeAt",0);F(this,"contextLost",!1);F(this,"lowFpsWindows",0);F(this,"highFpsWindows",0);F(this,"lastTierChangeAt",0);F(this,"upgradeAfter",0);F(this,"tween",null);F(this,"pointerClient",null);F(this,"pointerMoved",!1);F(this,"hoveredId",null);F(this,"pointerDown",null);F(this,"attracted",!0);F(this,"boundsRadius",150);F(this,"cityCenter",{x:0,z:0});F(this,"disposablesSky",[]);F(this,"observers",[]);F(this,"skyDome",null);F(this,"assets",null);F(this,"dayMix",0);F(this,"seed",null);F(this,"composer",null);F(this,"composerKey","");F(this,"mirror",null);F(this,"mirrorMatrix",new It);F(this,"cinematic",null);F(this,"exportSize",null);F(this,"tick",t=>{var i,s;if(this.disposed||(this.raf=requestAnimationFrame(this.tick),this.documentHidden)||this.softwareRenderer&&!this.surfaceDirty&&!this.qualityDirty&&t-this.lastRenderAt<1e3/15)return;const e=Math.min(.1,Math.max(.001,(t-this.lastTime)/1e3));this.lastTime=t,this.elapsed+=e,this.noteActivityIfNeeded();const n=t-this.lastActivityAt>SS&&!this.tween&&!this.playing;n&&!this.surfaceDirty&&!this.qualityDirty&&t-this.lastRenderAt<bS||(this.updateScene(e),this.renderFrame(),this.lastRenderAt=t,this.accountFrame(t,n),!this.firstFrameSent&&this.model&&(this.firstFrameSent=!0,(s=(i=this.options).onFirstFrame)==null||s.call(i)))});this.options=t;const e=t.canvas,n={antialias:t.headless||window.devicePixelRatio<1.75,powerPreference:"low-power",stencil:!1};this.renderer=new C_({canvas:e,...n});const i=this.renderer.getContext(),s=i.getExtension("WEBGL_debug_renderer_info");this.softwareRenderer=!!s&&/swiftshader|llvmpipe|software|softpipe/i.test(String(i.getParameter(s.UNMASKED_RENDERER_WEBGL))),this.renderer.toneMapping=Wr,this.renderer.toneMappingExposure=ce().exposure,this.renderer.shadowMap.enabled=!0,this.renderer.shadowMap.type=qs,this.camera=new on(42,1,1.5,8e3),this.camera.position.set(150,120,170),this.controls=t.headless?{target:new L,enabled:!1,enableDamping:!1,dampingFactor:0,maxPolarAngle:1.42,minDistance:16,maxDistance:900,autoRotate:!1,autoRotateSpeed:0,update:()=>(this.camera.lookAt(this.controls.target),!1),dispose:()=>{}}:new P_(this.camera,e),this.controls.enableDamping=!0,this.controls.dampingFactor=.08,this.controls.maxPolarAngle=1.42,this.controls.minDistance=16,this.controls.maxDistance=900,this.controls.autoRotate=!1,this.controls.autoRotateSpeed=.45;const a=ce();if(this.scene.background=new pt(a.skyHorizon),this.hemisphere=new Wm(a.hemiSky,a.hemiGround,a.hemiIntensity),this.scene.add(this.hemisphere),this.sun=new Ha(a.sunColor,a.sunIntensity),this.sun.position.set(120,160,70),this.sun.castShadow=!0,this.sun.shadow.mapSize.set(1024,1024),this.sun.shadow.camera.near=20,this.sun.shadow.camera.far=620,this.sun.shadow.bias=-6e-4,this.sun.shadow.radius=1,this.sun.shadow.normalBias=.6,this.scene.add(this.sun,this.sun.target),this.skyDome=this.buildSkyDome(),this.scene.add(this.skyDome),this.assetsReady=yM().then(v=>{var M;this.disposed||!v||(this.assets=v,this.applySkyImage(),(M=this.parts)==null||M.applyAssets(v))}),this.applyQualityLevel(0),this.upgradeAfter=performance.now()+6e4,t.headless)return;const o=e,l=v=>{this.pointerClient={x:v.clientX,y:v.clientY};const M=o.getBoundingClientRect();this.pointer.set((v.clientX-M.left)/M.width*2-1,-((v.clientY-M.top)/M.height)*2+1),this.pointerMoved=!0,this.noteActivity()},c=v=>{this.pointerDown={x:v.clientX,y:v.clientY,at:performance.now()},this.cinematic&&this.stopCinematic(),this.attracted&&(this.attracted=!1,this.controls.autoRotate=!1),this.noteActivity()},h=v=>{const M=this.pointerDown;this.pointerDown=null,this.noteActivity(),!(!M||Math.hypot(v.clientX-M.x,v.clientY-M.y)>7||performance.now()-M.at>500)&&this.handleClick()},d=()=>{this.attracted=!1,this.noteActivity()},u=()=>{this.documentHidden=document.visibilityState==="hidden",this.documentHidden?this.stopLoop():this.startLoop()};o.addEventListener("pointermove",l),o.addEventListener("pointerdown",c),o.addEventListener("pointerup",h),o.addEventListener("wheel",d,{passive:!0}),document.addEventListener("visibilitychange",u);const f=()=>{this.documentHidden=!0,this.stopLoop()},m=()=>{this.documentHidden=!1,this.noteActivity(),this.startLoop()};window.addEventListener("__AV_PLUGIN_SUSPENDED__",f),window.addEventListener("__AV_PLUGIN_RESUMED__",m),this.observers.push(()=>{window.removeEventListener("__AV_PLUGIN_SUSPENDED__",f),window.removeEventListener("__AV_PLUGIN_RESUMED__",m)}),this.observers.push(()=>o.removeEventListener("pointermove",l),()=>o.removeEventListener("pointerdown",c),()=>o.removeEventListener("pointerup",h),()=>o.removeEventListener("wheel",d),()=>document.removeEventListener("visibilitychange",u));const _=new ResizeObserver(()=>{this.surfaceDirty=!0});_.observe(o.parentElement??o);const p=v=>{v.preventDefault(),this.contextLost=!0,this.stopLoop()},g=()=>{this.contextLost=!1,this.surfaceWidth=0,this.surfaceDirty=this.qualityDirty=!0,this.documentHidden||this.startLoop()};e.addEventListener("webglcontextlost",p),e.addEventListener("webglcontextrestored",g),this.observers.push(()=>{_.disconnect(),e.removeEventListener("webglcontextlost",p),e.removeEventListener("webglcontextrestored",g)}),this.startLoop()}noteActivity(){this.lastActivityAt=performance.now()}renderMirror(){const t=this.parts;if(!t)return;if(this.quality<1){t.setMirror(null,null);return}const e=this.renderer.getDrawingBufferSize(new ft),n=Math.max(256,Math.floor(e.x/2)),i=Math.max(256,Math.floor(e.y/2));if(this.mirror){const a=this.mirror.getRenderTarget();(a.width!==n||a.height!==i)&&a.setSize(n,i)}else{const a=new to(new Vn(1,1),{textureWidth:n,textureHeight:i,clipBias:.003});a.rotation.x=-Math.PI/2,a.position.y=t.water.position.y,a.updateMatrixWorld(),this.mirror=a}t.water.visible=!1,this.mirror.onBeforeRender(this.renderer,this.scene,this.camera,void 0,void 0,void 0),t.water.visible=!0;const s=this.mirror.material.uniforms.textureMatrix.value;this.mirrorMatrix.copy(s).multiply(new It().copy(this.mirror.matrixWorld).invert()),t.setMirror(this.mirror.getRenderTarget().texture,this.mirrorMatrix)}renderFrame(){var i;this.flushSurface(),this.renderMirror();const t=this.quality>=1,e=this.quality>=1;if(!t&&!e){this.renderer.render(this.scene,this.camera);return}const n=`${t?"ao":""}|${e?"bloom":""}|${this.quality}`;if(!this.composer||this.composerKey!==n){(i=this.composer)==null||i.dispose();const s=this.renderer.getSize(new ft),a=new Z_(this.renderer);if(a.addPass(new $_(this.scene,this.camera)),t){const o=Math.random;let l=2654435769;Math.random=()=>{l=l+1831565813|0;let h=Math.imul(l^l>>>15,1|l);return h=h+Math.imul(h^h>>>7,61|h)^h,((h^h>>>14)>>>0)/4294967296};let c;try{c=new ni(this.scene,this.camera,s.x,s.y)}finally{Math.random=o}c.updateGtaoMaterial({radius:14,distanceExponent:1,thickness:8,distanceFallOff:1,scale:2.4,samples:this.quality>=2?16:10}),c.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:6,rings:2,samples:this.quality>=2?16:8}),c.blendIntensity=1,a.addPass(c)}e&&a.addPass(new Us(new ft(s.x,s.y),1,.6,2)),a.addPass(new J_),a.setPixelRatio(this.renderer.getPixelRatio()),a.setSize(s.x,s.y),this.composer=a,this.composerKey=n}this.composer.render()}resize(){var l,c;const t=this.options.canvas,e=this.options.headless?null:t.parentElement,n=((l=this.exportSize)==null?void 0:l.width)??Math.max(1,(e==null?void 0:e.clientWidth)??(this.options.headless?t.width:t.clientWidth)),i=((c=this.exportSize)==null?void 0:c.height)??Math.max(1,(e==null?void 0:e.clientHeight)??(this.options.headless?t.height:t.clientHeight)),s=this.quality>=2?2:this.quality===1?1.5:1,a=this.exportSize||this.options.headless?1:Math.min(window.devicePixelRatio||1,s,this.softwareRenderer?Math.min(640/n,360/i):1/0);if(n===this.surfaceWidth&&i===this.surfaceHeight&&a===this.surfacePixelRatio)return;const o=a!==this.surfacePixelRatio;if(this.surfaceWidth=n,this.surfaceHeight=i,this.surfacePixelRatio=a,this.lastSurfaceChangeAt=performance.now(),this.renderer.setDrawingBufferSize(n,i,a),this.composer&&(o&&this.composer.setPixelRatio(a),this.composer.setSize(n,i)),this.camera.aspect=n/i,this.camera.updateProjectionMatrix(),this.layout&&this.attracted){const h=this.homeView();this.camera.position.set(h.x,h.y,h.z),this.controls.target.set(this.cityCenter.x,6,this.cityCenter.z)}}async prepareExportAssets(){await Promise.all([this.assetsReady,this.floraReady])}photoView(){return{position:this.camera.position.toArray(),target:this.controls.target.toArray(),fov:this.camera.fov,elapsed:this.elapsed,cursorMs:this.cursorMs}}restorePhotoView(t){var e,n;this.attracted=!1,this.tween=null,this.playing=!1,this.elapsed=t.elapsed,this.cursorMs=t.cursorMs,this.camera.position.fromArray(t.position),this.controls.target.fromArray(t.target),this.camera.fov=t.fov,this.camera.updateProjectionMatrix(),(n=this.parts)==null||n.applyCursor(t.cursorMs??((e=this.model)==null?void 0:e.windowEndMs)??Date.now(),t.cursorMs===null),this.updateScene(0)}setSeed(t){if(t===this.seed)return;const e=this.seed===null;this.seed=t,this.layout=null,this.model&&this.applyModel(this.model,!1),e||this.resetView()}applyModel(t,e=!0){var d,u,f;if(this.model=t,this.seed===null)return;const n=this.parts?this.parts.displaySnapshot():null;this.parts&&(this.scene.remove(this.parts.group,this.parts.water),this.parts.dispose(),this.parts=null);const i=Oy(t,e?this.layout:null,this.seed);this.layout=i,this.parts=new Ky(t,i,n),this.assets&&this.parts.applyAssets(this.assets),this.parts.setSkyMix(this.dayMix),this.lastSkyHour=-1;const s=this.parts;this.floraReady=by(i.biome).then(m=>{this.parts===s&&!this.disposed&&s.applyFlora(m)}),this.scene.add(this.parts.group,this.parts.water),this.cityCenter={x:(i.urbanBounds.left+i.urbanBounds.right)/2,z:(i.urbanBounds.north+i.urbanBounds.south)/2},(d=this.aurora)==null||d.dispose(),this.aurora=new iS(this.cityCenter,Math.max(120,i.boundsRadius)*.6),this.scene.add(this.aurora.group),(u=this.ambient)==null||u.dispose(),this.ambient=new oS(this.cityCenter,Math.max(120,i.boundsRadius)*.6,i.terrain.height,i.river),this.scene.add(this.ambient.group),(f=this.wildlife)==null||f.dispose();const a=[],o=(m,_)=>Math.max(0,i.terrain.height(m,_));for(const m of i.publicSites)if(m.kind==="park")for(let _=0;_<48;_+=1){const p=_*2.399,g=m.radius*.85*Math.sqrt((_+.5)/48),v=m.x+Math.cos(p)*g,M=m.z+Math.sin(p)*g;a.push({x:v,z:M,y:o(v,M)})}for(const m of i.gardens??[])for(let _=0;_<14;_+=1){const p=_*2.399,g=Math.min(m.width,m.depth)*.45*Math.sqrt((_+.5)/14),v=m.x+Math.cos(p)*g,M=m.z+Math.sin(p)*g;a.push({x:v,z:M,y:m.y})}a.push(...i.parkTrees??[]),this.wildlife=new mS(this.cityCenter,Math.max(120,i.boundsRadius),a,i.seaMountains??[],i.districts.flatMap(m=>m.carPaths),o),this.scene.add(this.wildlife.group),this.fillLight||(this.fillLight=new Ha("#cfe8ef",.35),this.backLight=new Ha("#ffffff",.15),this.scene.add(this.fillLight,this.backLight));const l=Math.max(100,Math.hypot(i.urbanBounds.right-i.urbanBounds.left,i.urbanBounds.south-i.urbanBounds.north)/2+35);this.boundsRadius=l,this.controls.maxDistance=l*4.5,this.scene.fog=new or(new pt(ce().fog),l*2.1,l*7.5);const c=l*.85+24,h=this.sun.shadow.camera;if(this.placeSun(),h.far=this.sunDistance()+c*2,h.left=-c,h.right=c,h.top=c,h.bottom=-c,h.updateProjectionMatrix(),this.attracted){const m=this.homeView();this.flyTo(m,{...this.cityCenter,y:6},900)}this.parts.setLabelsVisible(!0),this.parts.setQualityLevel(this.quality),this.cursorMs!==null&&this.parts.applyCursor(this.cursorMs,!1,this.playbackSpeed*1e3),this.parts.snapToTargets()}sunDistance(){return Math.max(900,this.boundsRadius*2.2)}placeSun(){const t=ce(),e=sa.degToRad(t.sunAzimuthDeg),n=sa.degToRad(t.sunElevationDeg),i=this.sunDistance();this.sun.position.set(this.cityCenter.x+Math.cos(e)*Math.cos(n)*i,Math.sin(n)*i,this.cityCenter.z+Math.sin(e)*Math.cos(n)*i),this.sun.target.position.set(this.cityCenter.x,0,this.cityCenter.z),this.sun.target.updateMatrixWorld()}homeView(){const t=Math.max(120,this.boundsRadius),e=1.2*Math.max(1,1/this.camera.aspect);return{x:this.cityCenter.x+t*.86*e,y:t*1.05*e,z:this.cityCenter.z+t*1.16*e}}flyTo(t,e,n){this.tween={fromPos:this.camera.position.clone(),toPos:new L(t.x,t.y,t.z),fromTarget:this.controls.target.clone(),toTarget:new L(e.x,e.y,e.z),start:this.elapsed,duration:n/1e3}}resetView(){var e,n,i;const t=this.homeView();this.flyTo(t,{...this.cityCenter,y:6},900),(n=(e=this.options).onSelect)==null||n.call(e,null),(i=this.parts)==null||i.setSelected(null)}focusBuilding(t){if(!this.parts)return!1;const e=this.parts.anchorFor(t);if(!e)return!1;this.attracted=!1;const n=Math.max(26,e.height*2.1),i=new L().subVectors(this.camera.position,this.controls.target).setY(0).normalize();i.lengthSq()<.01&&i.set(.8,0,.6).normalize();const s=new L(e.x,e.ground,e.z).addScaledVector(i,n).add(new L(0,n*.62,0));return this.flyTo(s,{x:e.x,y:e.ground+Math.max(4,e.height*.45),z:e.z},850),!0}focusDistrict(t){if(!this.parts)return!1;const e=this.parts.districtAnchor(t);if(!e)return!1;this.attracted=!1;const n=e.radius*2.6,i=new L().subVectors(this.camera.position,this.controls.target).setY(0).normalize();i.lengthSq()<.01&&i.set(.8,0,.6).normalize();const s=new L(e.x,e.y,e.z).addScaledVector(i,n).add(new L(0,n*.7,0));return this.flyTo(s,{x:e.x,y:e.y,z:e.z},900),!0}setQualityMode(t){t!==this.qualityMode&&(this.qualityMode=t,this.lowFpsWindows=this.highFpsWindows=0,t==="high"?this.applyQualityLevel(2):t==="eco"?this.applyQualityLevel(0):this.applyQualityLevel(0))}applyQualityLevel(t){this.quality===t&&!this.exportSize||(this.quality=t,this.qualityDirty=this.surfaceDirty=!0)}flushSurface(){var t,e;if(this.qualityDirty){this.qualityDirty=!1;const n=this.quality;this.renderer.shadowMap.enabled=n>=1;const i=n>=2?4096:2048;this.sun.shadow.mapSize.x!==i&&(this.sun.shadow.mapSize.set(i,i),(t=this.sun.shadow.map)==null||t.dispose(),this.sun.shadow.map=null),(e=this.parts)==null||e.setQualityLevel(n)}this.resize(),this.surfaceDirty=!1}setLabelsVisible(t){var e;(e=this.parts)==null||e.setLabelsVisible(t)}get overflowCount(){var t;return(((t=this.layout)==null?void 0:t.massing)??[]).reduce((e,n)=>e+n.count,0)}setSelected(t){var e;(e=this.parts)==null||e.setSelected(t)}setTimeCursor(t,e){var n,i;this.cursorMs=t,(e==null?void 0:e.playing)!==void 0&&(this.playing=e.playing),(e==null?void 0:e.speed)!==void 0&&(this.playbackSpeed=e.speed),t!==null?(n=this.parts)==null||n.applyCursor(t,!1,this.playbackSpeed*1e3):this.model&&((i=this.parts)==null||i.applyCursor(this.model.windowEndMs,!0)),this.noteActivity()}get isPlaying(){return this.playing}handleClick(){var e,n,i,s;if(!this.parts)return;const t=this.pick();t?(this.parts.setSelected(t),this.focusBuilding(t),(n=(e=this.options).onSelect)==null||n.call(e,t)):(this.parts.setSelected(null),(s=(i=this.options).onSelect)==null||s.call(i,null))}pick(){if(!this.parts||!this.pointerClient)return null;this.raycaster.setFromCamera(this.pointer,this.camera);const t=this.raycaster.intersectObjects(this.parts.raycastTargets,!1);for(const e of t){if(e.instanceId===void 0)continue;const n=this.parts.idAt(e.object,e.instanceId);if(n)return n}return null}applyDayMix(t){var s,a,o;const e=(l,c,h)=>{const d=Math.min(1,Math.max(0,(h-l)/(c-l)));return d*d*(3-2*d)},n=e(6,8,t)*(1-e(16,18.5,t)),i=(a=(s=this.skyDome)==null?void 0:s.material)==null?void 0:a.uniforms;i&&(i.uDayMix.value=n),this.dayMix=n,(o=this.parts)==null||o.setSkyMix(n)}applySkyImage(){var e,n;const t=(n=(e=this.skyDome)==null?void 0:e.material)==null?void 0:n.uniforms;!t||!this.assets||(t.uSky.value=this.assets.sky.dusk,t.uSkyDay.value=this.assets.sky.day,t.uHasSky.value=1)}buildSkyDome(){const t=new yn(6e3,24,14),e=new le({side:nn,depthWrite:!1,fog:!1,uniforms:{topColor:{value:new pt(ce().skyTop)},midColor:{value:new pt(ce().skyMid)},horizonColor:{value:new pt(ce().skyHorizon)},uSky:{value:null},uHasSky:{value:0},uSkyDay:{value:null},uDayMix:{value:0},uGradeTop:{value:new pt(ce().skyGrade.top)},uGradeHorizon:{value:new pt(ce().skyGrade.horizon)},uGradeAmount:{value:ce().skyGrade.amount},uSkyYaw:{value:Sc(ce())},uStars:{value:0},uSkyDim:{value:1},uNight:{value:0},uOvercast:{value:0}},vertexShader:`
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,fragmentShader:`
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        uniform sampler2D uSky;
        uniform float uHasSky;
        uniform sampler2D uSkyDay;
        uniform float uDayMix;
        uniform vec3 uGradeTop;
        uniform vec3 uGradeHorizon;
        uniform float uGradeAmount;
        uniform float uSkyYaw;
        uniform float uStars;
        uniform float uSkyDim;
        uniform float uNight;
        uniform float uOvercast;
        varying vec3 vDirection;
        void main() {
          vec3 dir = normalize(vDirection);
          float height = clamp(dir.y, 0.0, 1.0);
          // 地平线 → 中段 → 天顶：日落主题靠中段的粉色撑出渐变带。
          vec3 color = mix(horizonColor, midColor, smoothstep(0.0, 0.28, height));
          color = mix(color, topColor, smoothstep(0.22, 0.85, height));
          vec3 gradient = color;
          if (uHasSky > 0.5) {
            // 等距柱状投影采样；地平线以下复用地平线那一行（下半球在水面以下，从不直接可见）。
            vec2 uv = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5 + uSkyYaw, asin(clamp(dir.y, 0.002, 1.0)) / 3.1415927 + 0.5);
            vec3 photoDusk = texture2D(uSky, uv).rgb;
            vec3 photoDay = texture2D(uSkyDay, uv).rgb;
            vec3 photo = mix(photoDusk, photoDay, uDayMix) * uSkyDim;
            // 调色：按高度在两个色调之间做 overlay 式乘染（保留云的明暗，只换色相）。
            vec3 tint = mix(uGradeHorizon, uGradeTop, smoothstep(0.0, 0.6, height));
            vec3 graded = photo * tint * 1.55;
            // 粉紫调色只染黄昏那部分：白天照片保持原色。
            color = mix(photo, graded, uGradeAmount * (1.0 - uDayMix));
          }
          // 夜里整张照片天空换成渐变：照片会整个覆盖渐变（夜预设的深蓝从来显示不出来），
          // 压暗的黄昏照片在 20:00 是灰白雾、23:00 仍是橙色日落（用户截图）。
          color = mix(color, gradient, uNight);
          float skyLuma = dot(color, vec3(0.299, 0.587, 0.114));
          color = mix(color, vec3(skyLuma) * vec3(0.9, 0.93, 0.97), uOvercast);
          // 程序星点：方向量化到球面网格，每格 hash 决定有无星；只在上半天空。放在最后，照片/渐变都看得见。
          if (uStars > 0.01) {
            vec3 cell = floor(dir * 190.0);
            float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            float star = step(0.9965, h) * smoothstep(0.22, 0.65, dir.y);
            color += vec3(0.92, 0.95, 1.0) * star * uStars * (0.55 + 0.45 * h) * (0.3 + 0.7 * uNight);
          }
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `}),n=new Xt(t,e);return n.renderOrder=-10,this.disposablesSky.push(t,e),n}startLoop(){this.options.headless||this.disposed||this.contextLost||this.raf||(this.lastTime=performance.now(),this.lastStatsAt=0,this.raf=requestAnimationFrame(this.tick))}diagnosticState(){return{firstFrame:this.firstFrameSent,contextLost:this.contextLost,loopScheduled:!!this.raf,modelApplied:!!this.model,frameAgeMs:Math.round(performance.now()-this.lastRenderAt),width:this.renderer.domElement.width,height:this.renderer.domElement.height}}stopLoop(){this.raf&&cancelAnimationFrame(this.raf),this.raf=0}noteActivityIfNeeded(){(this.controls.autoRotate||this.tween)&&(this.lastActivityAt=performance.now())}startCinematic(t="full"){var i,s;if(!this.layout||!this.model||!this.parts)return null;const e=Ay(this.layout,this.model,this.parts.anchors(),{cut:t});this.tween=null,this.playing=!1,this.attracted=!1,this.controls.autoRotate=!1,this.controls.enabled=!1;const n=(this.model.windowEndMs-this.model.windowStartMs)/Math.max(1,e.durationSec);return(i=this.rainbow)==null||i.set(0,0,this.cityCenter,1),(s=this.rain)==null||s.setAmount(0),this.cinematic={plan:e,startedAt:this.elapsed,savedFov:this.camera.fov,look:null,lastSeconds:0,pace:n},this.camera.fov=38,this.camera.updateProjectionMatrix(),this.parts.setLabelsVisible(!1),this.parts.setScaffoldVisible(!1),this.parts.applyCursor(e.cursor(0),!1,n),this.noteActivity(),e}stopCinematic(){var e,n,i,s,a,o,l,c;const t=this.cinematic;t&&(this.cinematic=null,this.controls.enabled=!0,this.camera.fov=t.savedFov,(e=this.parts)==null||e.setScaffoldVisible(!0),this.camera.updateProjectionMatrix(),this.cursorMs=null,(i=this.parts)==null||i.applyCursor(((n=this.model)==null?void 0:n.windowEndMs)??Date.now(),!0),(o=(a=this.options).onTimeCursor)==null||o.call(a,((s=this.model)==null?void 0:s.windowEndMs)??Date.now(),!0),(c=(l=this.options).onCinematic)==null||c.call(l,0,t.plan,!0))}async renderFilm(t){var o,l,c,h,d,u,f,m;if(!this.layout||!this.model||!this.parts)throw new Error("city not ready");if(typeof VideoEncoder>"u"||typeof VideoFrame>"u")throw new Error("WebCodecs unavailable");const e=[{codec:"V_VP9",string:"vp09.00.10.08"},{codec:"V_VP8",string:"vp8"}];let n=null;for(const _ of e)if((await VideoEncoder.isConfigSupported({codec:_.string,width:t.width,height:t.height,bitrate:t.bitrate,framerate:t.fps})).supported){n=_;break}if(!n)throw new Error("no WebM-capable video encoder");this.stopLoop();const i=this.quality,s=this.elapsed;let a=null;try{this.exportSize={width:t.width,height:t.height},this.applyQualityLevel(i),this.elapsed=0,this.lastSkyHour=Number.NaN,this.parts.resetAnimation(),(o=this.ambient)==null||o.reset(),(l=this.aurora)==null||l.reset(),(c=this.wildlife)==null||c.reset(),(h=this.rain)==null||h.reset();const _=this.startCinematic(t.cut);if(!_)throw new Error("cinematic unavailable");const p=Os(t.width,t.height),g=zc(p),v=new Py({codec:n.codec,width:t.width,height:t.height});let M=null,x=0;a=new VideoEncoder({output:E=>{if(x+=E.byteLength,x>(t.maxEncodedBytes??256*1024*1024)){M=new Error("export_memory_limit");return}const P=new Uint8Array(E.byteLength);E.copyTo(P),v.addChunk(E.timestamp/1e3,E.type==="key",P)},error:E=>{M=E}}),a.configure({codec:n.codec==="V_VP9"?"vp09.00.10.08":"vp8",width:t.width,height:t.height,bitrate:t.bitrate,framerate:t.fps});const b=1/t.fps;let S=0;const T=_.durationSec+4,y=Math.ceil(T*t.fps),A=async()=>{var P;const E=this.options.headless?Math.max(80,Math.min(5e3,S*4)):16;if(await new Promise(D=>setTimeout(D,E)),(P=t.signal)!=null&&P.aborted||this.disposed)throw new DOMException("aborted","AbortError")};(d=t.onProgress)==null||d.call(t,0,y),await A(),this.updateScene(0);for(let E=0;E<3;E+=1){await A();const P=performance.now();this.renderFrame(),S=performance.now()-P}for(let E=0;E<y;E+=1){if(await A(),(u=t.signal)!=null&&u.aborted)throw new DOMException("aborted","AbortError");if(M)throw M;const P=performance.now();this.elapsed+=b,this.updateScene(b),this.renderFrame(),g.drawImage(this.options.canvas,0,0,t.width,t.height),Ey(g,{width:t.width,height:t.height,seconds:E*b,durationSec:T,cards:_.cards,describe:t.describe,watermark:t.watermark,letterbox:t.letterbox}),(f=t.onFrame)==null||f.call(t,p,E);const D=new VideoFrame(p,{timestamp:Math.round(E*b*1e6)});for(a.encode(D,{keyFrame:E%(t.fps*2)===0}),D.close(),S=performance.now()-P;a.encodeQueueSize>6;)await A();(m=t.onProgress)==null||m.call(t,E+1,y)}if(await a.flush(),M)throw M;return v.finish(T*1e3)}finally{try{a==null||a.close()}catch{}this.stopCinematic(),this.exportSize=null,this.elapsed=s,this.disposed||(this.applyQualityLevel(i),this.startLoop())}}async capturePhoto(t={}){if(!this.parts)throw new Error("city not ready");const e=t.width??2560,n=t.height??1440,i=this.softwareRenderer?Math.min(1,640/e,360/n):1,s=Math.max(1,Math.round(e*i)),a=Math.max(1,Math.round(n*i)),o=this.quality,l=this.camera.aspect;this.stopLoop();const c=this.parts.hideOverlaysForPhoto();this.exportSize={width:s,height:a},this.applyQualityLevel(this.softwareRenderer?0:this.options.headless?o:2);try{this.options.headless&&await new Promise(f=>setTimeout(f,80));const h=performance.now();this.renderFrame(),this.options.headless&&await new Promise(f=>setTimeout(f,Math.max(80,Math.min(5e3,(performance.now()-h)*4)))),this.renderFrame();const d=Os(s,a),u=zc(d);if(u.drawImage(this.options.canvas,0,0,s,a),t.watermark){const f=a/1080;u.save(),u.globalAlpha=.6,u.fillStyle="#fff",u.shadowColor="rgba(0,0,0,0.5)",u.shadowBlur=8*f,u.textAlign="right",u.font=`600 ${Math.round(16*f)}px system-ui, -apple-system, 'Segoe UI', 'PingFang SC', sans-serif`,u.fillText(t.watermark,s-28*f,a-24*f),u.restore()}return typeof document>"u"?await d.convertToBlob({type:"image/png"}):await new Promise((f,m)=>d.toBlob(_=>_?f(_):m(new Error("PNG encode failed")),"image/png"))}finally{c(),this.exportSize=null,this.applyQualityLevel(o),this.camera.aspect=l,this.camera.updateProjectionMatrix(),this.startLoop()}}get isCinematic(){return this.cinematic!==null}updateCinematic(){var l,c,h,d,u,f,m;const t=this.cinematic;if(!t)return!1;const e=this.elapsed-t.startedAt,n=Math.min(e,t.plan.durationSec);(l=this.parts)==null||l.setLabelsVisible(!1),(c=this.parts)==null||c.setScaffoldVisible(!1);const i=t.plan.position(n);this.layout&&(i.y=Math.max(i.y,Math.max(0,this.layout.terrain.height(i.x,i.z))+6)),this.camera.position.copy(i);const s=t.plan.target(n),a=Math.max(0,e-t.lastSeconds);t.lastSeconds=e,t.look?t.look.lerp(s,1-Math.exp(-a/.35)):t.look=s.clone(),this.controls.target.copy(t.look),this.camera.lookAt(t.look);const o=t.plan.cursor(n);return(h=this.parts)==null||h.applyCursor(o,!1,t.pace),(u=(d=this.options).onTimeCursor)==null||u.call(d,o,!1),(m=(f=this.options).onCinematic)==null||m.call(f,e,t.plan,!1),this.lastActivityAt=performance.now(),e>t.plan.durationSec+4&&this.stopCinematic(),!0}updateDaylight(){let t;if(this.cinematic)t=dd+(yS-dd)*Math.min(1,this.cinematic.lastSeconds/this.cinematic.plan.durationSec);else{const n=this.cursorMs!==null?new Date(this.cursorMs):new Date;t=n.getHours()+n.getMinutes()/60+n.getSeconds()/3600}if(Math.abs(t-this.lastSkyHour)<(this.cinematic?5e-4:.02))return;this.lastSkyHour=t,this.applyDayMix(t);const e=jy(t);this.applySky(e),this.cinematic||this.applyWeather(this.cursorMs??Date.now())}applyWeather(t){var d,u,f;const e=xS(t),n=e.overcast;this.rain||(this.rain=new _S,this.scene.add(this.rain.mesh)),this.rainbow||(this.rainbow=new MS(Math.max(90,this.boundsRadius*.35)),this.scene.add(this.rainbow.mesh)),this.rain.setAspect(this.renderer.domElement.width,this.renderer.domElement.height),this.rain.setAmount(e.kind==="rain"?e.intensity*.8:0);const i=Math.atan2(this.sun.position.z-this.cityCenter.z,this.sun.position.x-this.cityCenter.x);this.rainbow.set(e.rainbow,i,this.cityCenter,Math.max(240,this.boundsRadius*.85));const s=(u=(d=this.skyDome)==null?void 0:d.material)==null?void 0:u.uniforms;if(s&&(s.uOvercast.value=Math.min(.85,n*.85)),n<=.001&&e.rainbow<=.001)return;const a=new pt("#9aa3ab"),o=new pt("#aeb6bc"),l=new pt("#3c4a54"),c=(f=this.skyDome)==null?void 0:f.material;c&&(c.uniforms.topColor.value.lerp(a,.5*n),c.uniforms.midColor.value.lerp(a,.5*n),c.uniforms.horizonColor.value.lerp(o,.55*n)),this.scene.background.lerp(o,.5*n);const h=this.scene.fog;if(h instanceof or&&(h.color.lerp(o,.5*n),h.near*=1-.5*n,h.far*=1-.45*n),this.sun.intensity*=1-.55*n,this.hemisphere.intensity*=1+.18*n,this.fillLight&&(this.fillLight.intensity*=1-.3*n),this.backLight&&(this.backLight.intensity*=1-.3*n),this.parts){const m=this.parts.cloudMaterial;m&&(m.opacity=Math.min(1,m.opacity+.55*n));const _=this.parts.waterColors;_&&(_.uShallow.value.lerp(l,.35*n),_.uDeep.value.lerp(l,.35*n))}}applySky(t){var o,l,c,h,d,u;const e=(o=this.skyDome)==null?void 0:o.material;if(!e)return;const n=e.uniforms;n.topColor.value.set(t.top),n.midColor.value.set(t.middle),n.horizonColor.value.set(t.horizon),n.uStars.value=t.stars,n.uSkyDim.value=.22+.78*Math.min(1,t.sunIntensity/1.2);const i=1-Math.min(1,Math.max(0,(t.sunIntensity-.32)/(.95-.32)));n.uNight.value=i*i*(3-2*i),(l=this.parts)==null||l.setNightWater(n.uNight.value),n.uOvercast.value=0,this.scene.background.set(t.fog);const s=this.scene.fog;if(s&&s instanceof or){s.color.set(t.fog);const f=Math.max(120,this.boundsRadius);s.near=f*t.fogNearFactor,s.far=f*t.fogFarFactor}this.hemisphere.color.set(t.hemiSky),this.hemisphere.groundColor.set(t.hemiGround),this.hemisphere.intensity=t.hemiIntensity,this.sun.color.set(t.sunColor),this.sun.intensity=t.sunIntensity,this.fillLight&&this.backLight&&(this.fillLight.color.set(t.fillColor),this.fillLight.intensity=t.fillIntensity,this.backLight.color.set(t.backColor),this.backLight.intensity=t.backIntensity);const a=320;if(this.sun.position.set(this.cityCenter.x+Math.cos(t.sunAzimuth)*Math.cos(t.sunElevation)*a,Math.sin(t.sunElevation)*a,this.cityCenter.z+Math.sin(t.sunAzimuth)*Math.cos(t.sunElevation)*a),this.parts){const f=this.parts.waterColors;if(f){f.uShallow.value.set(t.waterShallow),f.uDeep.value.set(t.waterDeep);const _=this.layout?Lf[this.layout.biome]:null;if(_!=null&&_.water){const p={h:0,s:0,l:0};new pt(t.waterShallow).getHSL(p);const g=Math.min(1,p.l*2.2);f.uShallow.value.lerp(new pt(_.water.shallow),_.waterAmount*g),f.uDeep.value.lerp(new pt(_.water.deep),_.waterAmount*g)}f.uSky.value.set(t.fog)}const m=this.parts.cloudMaterial;m&&(m.opacity=t.cloudOpacity),(c=this.aurora)==null||c.setNight(t.stars),(h=this.ambient)==null||h.setNight(t.stars),(u=this.wildlife)==null||u.setNight(t.stars,this.cinematic?((d=this.model)==null?void 0:d.windowEndMs)??0:this.cursorMs??Date.now()),this.parts.setNightGlow(t.selfLit),this.parts.applySelfLit(this.themeSelfLit),this.parts.setNightWater(n.uNight.value)}}updateScene(t){var e,n,i,s,a,o,l,c,h,d,u,f,m,_;if(this.updateDaylight(),(e=this.aurora)==null||e.update(t),(n=this.ambient)==null||n.update(t,this.elapsed),(i=this.wildlife)==null||i.update(t,this.elapsed),this.cinematic?(s=this.rain)==null||s.setAmount(0):(a=this.rain)==null||a.update(t,this.elapsed,this.camera),this.updateCinematic()){(o=this.parts)==null||o.update(t,this.elapsed);return}if(this.playing&&this.model){const p=(this.cursorMs??this.model.windowStartMs)+t*1e3*this.playbackSpeed;p>=this.model.windowEndMs?(this.cursorMs=this.model.windowEndMs,this.playing=!1):this.cursorMs=p,(l=this.parts)==null||l.applyCursor(this.cursorMs,!1,this.playbackSpeed*1e3),(h=(c=this.options).onTimeCursor)==null||h.call(c,this.cursorMs,!1)}if(this.tween){const p=Math.min(1,(this.elapsed-this.tween.start)/this.tween.duration),g=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;this.camera.position.lerpVectors(this.tween.fromPos,this.tween.toPos,g),this.controls.target.lerpVectors(this.tween.fromTarget,this.tween.toTarget,g),p>=1&&(this.tween=null)}if(this.controls.update(),this.layout){const p=Math.max(0,this.layout.terrain.height(this.camera.position.x,this.camera.position.z))+3;this.camera.position.y<p&&(this.camera.position.y=p)}if((d=this.parts)==null||d.update(t,this.elapsed),this.parts&&this.pointerClient&&(this.pointerMoved||this.tween)){this.pointerMoved=!1;const p=this.pick();p!==this.hoveredId&&(this.hoveredId=p,this.parts.setHovered(p)),p?(f=(u=this.options).onHover)==null||f.call(u,p,this.pointerClient.x,this.pointerClient.y):(_=(m=this.options).onHover)==null||_.call(m,null,0,0)}}accountFrame(t,e){var n,i,s;if(this.frameCount+=1,this.lastStatsAt===0){this.lastStatsAt=t,this.frameCount=0;return}if(t-this.lastStatsAt>1e3){const a=this.frameCount*1e3/Math.max(1,t-this.lastStatsAt);this.fps=a,this.frameCount=0,this.lastStatsAt=t,(s=(i=this.options).onStats)==null||s.call(i,{fps:Math.round(a),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,buildings:((n=this.model)==null?void 0:n.buildings.length)??0,quality:this.quality,idle:e}),this.maybeRetier(a,e)}}maybeRetier(t,e){if(this.qualityMode!=="auto"||e||this.surfaceDirty||performance.now()-this.lastSurfaceChangeAt<2e3){this.lowFpsWindows=this.highFpsWindows=0;return}const n=performance.now();if(this.lowFpsWindows=t<27?this.lowFpsWindows+1:0,this.highFpsWindows=t>55?this.highFpsWindows+1:0,!(n-this.lastTierChangeAt<12e3)){if(this.lowFpsWindows>=3&&this.quality>0)this.applyQualityLevel(this.quality-1),this.upgradeAfter=n+6e4;else if(this.highFpsWindows>=8&&n>=this.upgradeAfter&&this.quality<2)this.applyQualityLevel(this.quality+1);else return;this.lastTierChangeAt=n,this.lowFpsWindows=this.highFpsWindows=0}}dispose(){var t,e,n,i,s,a,o;this.disposed=!0,this.stopLoop(),this.observers.forEach(l=>l()),this.parts&&(this.scene.remove(this.parts.group,this.parts.water),this.parts.dispose(),this.parts=null),(t=this.composer)==null||t.dispose(),this.composer=null,(e=this.mirror)==null||e.dispose(),this.mirror=null,this.controls.dispose(),(n=this.aurora)==null||n.dispose(),this.aurora=null,(i=this.ambient)==null||i.dispose(),this.ambient=null,(s=this.wildlife)==null||s.dispose(),this.wildlife=null,(a=this.rain)==null||a.dispose(),this.rain=null,(o=this.rainbow)==null||o.dispose(),this.rainbow=null,this.disposablesSky.forEach(l=>l.dispose()),this.renderer.dispose()}}const ks=r=>self.postMessage(r);ks({type:"ready"});let pd=!1,Yc=!1;self.onmessage=async r=>{var n,i;if(((n=r.data)==null?void 0:n.type)==="preview-ack"){Yc=!1;return}if(pd||((i=r.data)==null?void 0:i.type)!=="start")return;pd=!0;let t=null;const e=setInterval(()=>ks({type:"pulse"}),500);try{const s=r.data.job;if(!Number.isInteger(s.seed)||s.seed<1||s.seed>4294967295||!Number.isInteger(s.width)||s.width<1||s.width>1920||!Number.isInteger(s.height)||s.height<1||s.height>1080||!Number.isInteger(s.fps)||s.fps<1||s.fps>30||!Number.isFinite(s.bitrate)||s.bitrate<1||s.bitrate>12e6||!["short","full"].includes(s.cut))throw new Error("invalid_export_job");if(typeof OffscreenCanvas>"u"||typeof VideoEncoder>"u"||typeof VideoFrame>"u")throw new Error("background_export_unavailable");const a=new OffscreenCanvas(s.width,s.height),o=a.getContext("webgl2",{powerPreference:"low-power",antialias:!0});if(!o)throw new Error("background_webgl_unavailable");const l=o.getExtension("WEBGL_debug_renderer_info"),c=l?String(o.getParameter(l.UNMASKED_RENDERER_WEBGL)):"",h=/swiftshader|llvmpipe|software|softpipe/i.test(c);h&&(s.width>640||s.height>360)&&(s.width=640,s.height=360,a.width=640,a.height=360),ks({type:"profile",width:s.width,height:s.height,software:h}),t=new wS({canvas:a,headless:!0}),t.setSeed(s.seed),t.setQualityMode("eco"),t.applyModel(s.model,!1),await t.prepareExportAssets();let d=-1,u=-1/0;const f=new OffscreenCanvas(Math.min(640,s.width),Math.min(360,s.height)),m=f.getContext("2d"),_=await t.renderFilm({...s,letterbox:2.39,watermark:"agent-vitals",maxEncodedBytes:256*1024*1024,onFrame:(p,g)=>{if(!m||Yc||performance.now()-u<500)return;m.drawImage(p,0,0,f.width,f.height);const v=f.transferToImageBitmap();Yc=!0,u=performance.now(),self.postMessage({type:"preview",bitmap:v,frame:g},{transfer:[v]})},describe:p=>{const g=s.model.stats.tokensTotal.toLocaleString();return p.kind==="title"?{eyebrow:"AGENT VITALS",title:`${s.model.stats.renderedSessions} 个会话，一座城市`,subtitle:`${s.model.windowLabel} · ${g} tokens`}:p.kind==="district"?{eyebrow:"执行环境城区",title:p.text,subtitle:`${p.detail??""} 个会话`}:{title:g,subtitle:`${s.model.districts.length} 个城区 · token · 非费用账单`}},onProgress:(p,g)=>{const v=Math.floor(p/g*100);(v!==d||p===g)&&(d=v,ks({type:"progress",frame:p,total:g}))}});ks({type:"complete",blob:_})}catch(s){const a=["invalid_export_job","background_export_unavailable","background_webgl_unavailable","export_memory_limit","no WebM-capable video encoder"];ks({type:"error",code:s instanceof Error&&a.includes(s.message)?s.message:"background_export_failed"})}finally{clearInterval(e),t==null||t.dispose()}}})();
