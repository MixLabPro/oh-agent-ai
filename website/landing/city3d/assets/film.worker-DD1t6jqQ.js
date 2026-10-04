var db=Object.defineProperty;var pb=(Ss,wn,Kn)=>wn in Ss?db(Ss,wn,{enumerable:!0,configurable:!0,writable:!0,value:Kn}):Ss[wn]=Kn;var F=(Ss,wn,Kn)=>pb(Ss,typeof wn!="symbol"?wn+"":wn,Kn);(function(){"use strict";/**
 * @license
 * Copyright 2010-2026 Three.js Authors
 * SPDX-License-Identifier: MIT
 */const wn={ROTATE:0,DOLLY:1,PAN:2},Kn={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},Jp=0,xu=1,jp=2,Tr=1,Qp=2,Ar=3,ki=0,xn=1,rn=2,an=0,ws=1,Jn=2,vu=3,_u=4,Mu=5,ai=100,em=101,tm=102,nm=103,im=104,Er=200,sm=201,rm=202,am=203,yu=204,Su=205,ol=206,om=207,ll=208,lm=209,cm=210,hm=211,um=212,fm=213,dm=214,cl=0,hl=1,ul=2,Cr=3,fl=4,dl=5,pl=6,ml=7,gl=0,pm=1,mm=2,oi=0,xl=1,vl=2,_l=3,Pa=4,Ml=5,yl=6,Sl=7,wu="attached",gm="detached",bu=300,ns=301,bs=302,Ia=303,wl=304,La=306,bn=1e3,Fn=1001,Da=1002,Ht=1003,Tu=1004,Rr=1005,Gt=1006,Ua=1007,Ti=1008,vn=1009,Au=1010,Eu=1011,Pr=1012,bl=1013,li=1014,On=1015,un=1016,Tl=1017,Al=1018,Ts=1020,Cu=35902,Ru=35899,Pu=1021,Iu=1022,Cn=1023,Ai=1026,Vi=1027,Na=1028,El=1029,is=1030,Cl=1031,Rl=1033,za=33776,Fa=33777,Oa=33778,Ba=33779,Pl=35840,Il=35841,Ll=35842,Dl=35843,Ul=36196,Nl=37492,zl=37496,Fl=37488,Ol=37489,ka=37490,Bl=37491,kl=37808,Vl=37809,Hl=37810,Gl=37811,Wl=37812,Xl=37813,Yl=37814,ql=37815,Zl=37816,$l=37817,Kl=37818,Jl=37819,jl=37820,Ql=37821,ec=36492,tc=36494,nc=36495,ic=36283,sc=36284,Va=36285,rc=36286,Ir=2300,Lr=2301,ac=2302,Lu=2303,Du=2400,Uu=2401,Nu=2402,xm=2500,vm=0,zu=1,oc=2,_m=3200,Dr=0,Mm=1,Ei="",Wt="srgb",Rn="srgb-linear",Ha="linear",_t="srgb",lc=7680,ym=519,Sm=512,wm=513,bm=514,cc=515,Tm=516,Am=517,hc=518,Em=519,Fu=35044,Hi=35048,Ou="300 es",ci=2e3,Ur=2001;function Cm(s){for(let e=s.length-1;e>=0;--e)if(s[e]>=65535)return!0;return!1}function Rm(s){return ArrayBuffer.isView(s)&&!(s instanceof DataView)}function Nr(s){return document.createElementNS("http://www.w3.org/1999/xhtml",s)}function Pm(){const s=Nr("canvas");return s.style.display="block",s}const Bu={};function Ga(...s){const e="THREE."+s.shift();console.log(e,...s)}function ku(s){const e=s[0];if(typeof e=="string"&&e.startsWith("TSL:")){const t=s[1];t&&t.isStackTrace?s[0]+=" "+t.getLocation():s[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return s}function Fe(...s){s=ku(s);const e="THREE."+s.shift();{const t=s[0];t&&t.isStackTrace?console.warn(t.getError(e)):console.warn(e,...s)}}function He(...s){s=ku(s);const e="THREE."+s.shift();{const t=s[0];t&&t.isStackTrace?console.error(t.getError(e)):console.error(e,...s)}}function As(...s){const e=s.join(" ");e in Bu||(Bu[e]=!0,Fe(...s))}function Im(s,e,t){return new Promise(function(n,i){function r(){switch(s.clientWaitSync(e,s.SYNC_FLUSH_COMMANDS_BIT,0)){case s.WAIT_FAILED:i();break;case s.TIMEOUT_EXPIRED:setTimeout(r,t);break;default:n()}}setTimeout(r,t)})}const Lm={[cl]:hl,[ul]:pl,[fl]:ml,[Cr]:dl,[hl]:cl,[pl]:ul,[ml]:fl,[dl]:Cr};class Gi{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){const n=this._listeners;return n===void 0?!1:n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){const n=this._listeners;if(n===void 0)return;const i=n[e];if(i!==void 0){const r=i.indexOf(t);r!==-1&&i.splice(r,1)}}dispatchEvent(e){const t=this._listeners;if(t===void 0)return;const n=t[e.type];if(n!==void 0){e.target=this;const i=n.slice(0);for(let r=0,a=i.length;r<a;r++)i[r].call(this,e);e.target=null}}}const pn=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];let Vu=1234567;const zr=Math.PI/180,Es=180/Math.PI;function Bn(){const s=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(pn[s&255]+pn[s>>8&255]+pn[s>>16&255]+pn[s>>24&255]+"-"+pn[e&255]+pn[e>>8&255]+"-"+pn[e>>16&15|64]+pn[e>>24&255]+"-"+pn[t&63|128]+pn[t>>8&255]+"-"+pn[t>>16&255]+pn[t>>24&255]+pn[n&255]+pn[n>>8&255]+pn[n>>16&255]+pn[n>>24&255]).toLowerCase()}function Je(s,e,t){return Math.max(e,Math.min(t,s))}function uc(s,e){return(s%e+e)%e}function Dm(s,e,t,n,i){return n+(s-e)*(i-n)/(t-e)}function Um(s,e,t){return s!==e?(t-s)/(e-s):0}function Fr(s,e,t){return(1-t)*s+t*e}function Nm(s,e,t,n){return Fr(s,e,1-Math.exp(-t*n))}function zm(s,e=1){return e-Math.abs(uc(s,e*2)-e)}function Fm(s,e,t){return s<=e?0:s>=t?1:(s=(s-e)/(t-e),s*s*(3-2*s))}function Om(s,e,t){return s<=e?0:s>=t?1:(s=(s-e)/(t-e),s*s*s*(s*(s*6-15)+10))}function Bm(s,e){return s+Math.floor(Math.random()*(e-s+1))}function km(s,e){return s+Math.random()*(e-s)}function Vm(s){return s*(.5-Math.random())}function Hm(s){s!==void 0&&(Vu=s);let e=Vu+=1831565813;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}function Gm(s){return s*zr}function Wm(s){return s*Es}function Xm(s){return s>0&&Number.isInteger(s)&&2**Math.round(Math.log2(s))===s}function Ym(s){return Math.pow(2,Math.ceil(Math.log(s)/Math.LN2))}function qm(s){return Math.pow(2,Math.floor(Math.log(s)/Math.LN2))}function Zm(s,e,t,n,i){const r=Math.cos,a=Math.sin,o=r(t/2),l=a(t/2),c=r((e+n)/2),h=a((e+n)/2),d=r((e-n)/2),u=a((e-n)/2),f=r((n-e)/2),m=a((n-e)/2);switch(i){case"XYX":s.set(o*h,l*d,l*u,o*c);break;case"YZY":s.set(l*u,o*h,l*d,o*c);break;case"ZXZ":s.set(l*d,l*u,o*h,o*c);break;case"XZX":s.set(o*h,l*m,l*f,o*c);break;case"YXY":s.set(l*f,o*h,l*m,o*c);break;case"ZYZ":s.set(l*m,l*f,o*h,o*c);break;default:Fe("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+i)}}function jn(s,e){switch(e.constructor){case Float32Array:return s;case Uint32Array:return s/4294967295;case Uint16Array:return s/65535;case Uint8Array:case Uint8ClampedArray:return s/255;case Int32Array:return Math.max(s/2147483647,-1);case Int16Array:return Math.max(s/32767,-1);case Int8Array:return Math.max(s/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function wt(s,e){switch(e.constructor){case Float32Array:return s;case Uint32Array:return Math.round(s*4294967295);case Uint16Array:return Math.round(s*65535);case Uint8Array:case Uint8ClampedArray:return Math.round(s*255);case Int32Array:return Math.round(s*2147483647);case Int16Array:return Math.round(s*32767);case Int8Array:return Math.round(s*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}const Wa={DEG2RAD:zr,RAD2DEG:Es,generateUUID:Bn,clamp:Je,euclideanModulo:uc,mapLinear:Dm,inverseLerp:Um,lerp:Fr,damp:Nm,pingpong:zm,smoothstep:Fm,smootherstep:Om,randInt:Bm,randFloat:km,randFloatSpread:Vm,seededRandom:Hm,degToRad:Gm,radToDeg:Wm,isPowerOfTwo:Xm,ceilPowerOfTwo:Ym,floorPowerOfTwo:qm,setQuaternionFromProperEuler:Zm,normalize:wt,denormalize:jn},uu=class uu{constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("THREE.Vector2: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){const t=this.x,n=this.y,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6],this.y=i[1]*t+i[4]*n+i[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Je(this.x,e.x,t.x),this.y=Je(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=Je(this.x,e,t),this.y=Je(this.y,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Je(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(Je(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){const n=Math.cos(t),i=Math.sin(t),r=this.x-e.x,a=this.y-e.y;return this.x=r*n-a*i+e.x,this.y=r*i+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}};uu.prototype.isVector2=!0;let pe=uu;class Jt{constructor(e=0,t=0,n=0,i=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=i}static slerpFlat(e,t,n,i,r,a,o){let l=n[i+0],c=n[i+1],h=n[i+2],d=n[i+3],u=r[a+0],f=r[a+1],m=r[a+2],_=r[a+3];if(d!==_||l!==u||c!==f||h!==m){let p=l*u+c*f+h*m+d*_;p<0&&(u=-u,f=-f,m=-m,_=-_,p=-p);let g=1-o;if(p<.9995){const v=Math.acos(p),M=Math.sin(v);g=Math.sin(g*v)/M,o=Math.sin(o*v)/M,l=l*g+u*o,c=c*g+f*o,h=h*g+m*o,d=d*g+_*o}else{l=l*g+u*o,c=c*g+f*o,h=h*g+m*o,d=d*g+_*o;const v=1/Math.sqrt(l*l+c*c+h*h+d*d);l*=v,c*=v,h*=v,d*=v}}e[t]=l,e[t+1]=c,e[t+2]=h,e[t+3]=d}static multiplyQuaternionsFlat(e,t,n,i,r,a){const o=n[i],l=n[i+1],c=n[i+2],h=n[i+3],d=r[a],u=r[a+1],f=r[a+2],m=r[a+3];return e[t]=o*m+h*d+l*f-c*u,e[t+1]=l*m+h*u+c*d-o*f,e[t+2]=c*m+h*f+o*u-l*d,e[t+3]=h*m-o*d-l*u-c*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,i){return this._x=e,this._y=t,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){const n=e._x,i=e._y,r=e._z,a=e._order,o=Math.cos,l=Math.sin,c=o(n/2),h=o(i/2),d=o(r/2),u=l(n/2),f=l(i/2),m=l(r/2);switch(a){case"XYZ":this._x=u*h*d+c*f*m,this._y=c*f*d-u*h*m,this._z=c*h*m+u*f*d,this._w=c*h*d-u*f*m;break;case"YXZ":this._x=u*h*d+c*f*m,this._y=c*f*d-u*h*m,this._z=c*h*m-u*f*d,this._w=c*h*d+u*f*m;break;case"ZXY":this._x=u*h*d-c*f*m,this._y=c*f*d+u*h*m,this._z=c*h*m+u*f*d,this._w=c*h*d-u*f*m;break;case"ZYX":this._x=u*h*d-c*f*m,this._y=c*f*d+u*h*m,this._z=c*h*m-u*f*d,this._w=c*h*d+u*f*m;break;case"YZX":this._x=u*h*d+c*f*m,this._y=c*f*d+u*h*m,this._z=c*h*m-u*f*d,this._w=c*h*d-u*f*m;break;case"XZY":this._x=u*h*d-c*f*m,this._y=c*f*d-u*h*m,this._z=c*h*m+u*f*d,this._w=c*h*d+u*f*m;break;default:Fe("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){const n=t/2,i=Math.sin(n);return this._x=e.x*i,this._y=e.y*i,this._z=e.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){const t=e.elements,n=t[0],i=t[4],r=t[8],a=t[1],o=t[5],l=t[9],c=t[2],h=t[6],d=t[10],u=n+o+d;if(u>0){const f=.5/Math.sqrt(u+1);this._w=.25/f,this._x=(h-l)*f,this._y=(r-c)*f,this._z=(a-i)*f}else if(n>o&&n>d){const f=2*Math.sqrt(1+n-o-d);this._w=(h-l)/f,this._x=.25*f,this._y=(i+a)/f,this._z=(r+c)/f}else if(o>d){const f=2*Math.sqrt(1+o-n-d);this._w=(r-c)/f,this._x=(i+a)/f,this._y=.25*f,this._z=(l+h)/f}else{const f=2*Math.sqrt(1+d-n-o);this._w=(a-i)/f,this._x=(r+c)/f,this._y=(l+h)/f,this._z=.25*f}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(Je(this.dot(e),-1,1)))}rotateTowards(e,t){const n=this.angleTo(e);if(n===0)return this;const i=Math.min(1,t/n);return this.slerp(e,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){const n=e._x,i=e._y,r=e._z,a=e._w,o=t._x,l=t._y,c=t._z,h=t._w;return this._x=n*h+a*o+i*c-r*l,this._y=i*h+a*l+r*o-n*c,this._z=r*h+a*c+n*l-i*o,this._w=a*h-n*o-i*l-r*c,this._onChangeCallback(),this}slerp(e,t){let n=e._x,i=e._y,r=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,i=-i,r=-r,a=-a,o=-o);let l=1-t;if(o<.9995){const c=Math.acos(o),h=Math.sin(c);l=Math.sin(l*c)/h,t=Math.sin(t*c)/h,this._x=this._x*l+n*t,this._y=this._y*l+i*t,this._z=this._z*l+r*t,this._w=this._w*l+a*t,this._onChangeCallback()}else this._x=this._x*l+n*t,this._y=this._y*l+i*t,this._z=this._z*l+r*t,this._w=this._w*l+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){const e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(i*Math.sin(e),i*Math.cos(e),r*Math.sin(t),r*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}const fu=class fu{constructor(e=0,t=0,n=0){this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("THREE.Vector3: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Hu.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Hu.setFromAxisAngle(e,t))}applyMatrix3(e){const t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*i,this.y=r[1]*t+r[4]*n+r[7]*i,this.z=r[2]*t+r[5]*n+r[8]*i,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){const t=this.x,n=this.y,i=this.z,r=e.elements,a=1/(r[3]*t+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*i+r[12])*a,this.y=(r[1]*t+r[5]*n+r[9]*i+r[13])*a,this.z=(r[2]*t+r[6]*n+r[10]*i+r[14])*a,this}applyQuaternion(e){const t=this.x,n=this.y,i=this.z,r=e.x,a=e.y,o=e.z,l=e.w,c=2*(a*i-o*n),h=2*(o*t-r*i),d=2*(r*n-a*t);return this.x=t+l*c+a*d-o*h,this.y=n+l*h+o*c-r*d,this.z=i+l*d+r*h-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){const t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*i,this.y=r[1]*t+r[5]*n+r[9]*i,this.z=r[2]*t+r[6]*n+r[10]*i,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Je(this.x,e.x,t.x),this.y=Je(this.y,e.y,t.y),this.z=Je(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=Je(this.x,e,t),this.y=Je(this.y,e,t),this.z=Je(this.z,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Je(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){const n=e.x,i=e.y,r=e.z,a=t.x,o=t.y,l=t.z;return this.x=i*l-r*o,this.y=r*a-n*l,this.z=n*o-i*a,this}projectOnVector(e){const t=e.lengthSq();if(t===0)return this.set(0,0,0);const n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return fc.copy(this).projectOnVector(e),this.sub(fc)}reflect(e){return this.sub(fc.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(Je(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y,i=this.z-e.z;return t*t+n*n+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){const i=Math.sin(t)*e;return this.x=i*Math.sin(n),this.y=Math.cos(t)*e,this.z=i*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){const t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),i=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=i,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}};fu.prototype.isVector3=!0;let L=fu;const fc=new L,Hu=new Jt,du=class du{constructor(e,t,n,i,r,a,o,l,c){this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,i,r,a,o,l,c)}set(e,t,n,i,r,a,o,l,c){const h=this.elements;return h[0]=e,h[1]=i,h[2]=o,h[3]=t,h[4]=r,h[5]=l,h[6]=n,h[7]=a,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){const t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,i=t.elements,r=this.elements,a=n[0],o=n[3],l=n[6],c=n[1],h=n[4],d=n[7],u=n[2],f=n[5],m=n[8],_=i[0],p=i[3],g=i[6],v=i[1],M=i[4],x=i[7],w=i[2],S=i[5],A=i[8];return r[0]=a*_+o*v+l*w,r[3]=a*p+o*M+l*S,r[6]=a*g+o*x+l*A,r[1]=c*_+h*v+d*w,r[4]=c*p+h*M+d*S,r[7]=c*g+h*x+d*A,r[2]=u*_+f*v+m*w,r[5]=u*p+f*M+m*S,r[8]=u*g+f*x+m*A,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8];return t*a*h-t*o*c-n*r*h+n*o*l+i*r*c-i*a*l}invert(){const e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],d=h*a-o*c,u=o*l-h*r,f=c*r-a*l,m=t*d+n*u+i*f;if(m===0)return this.set(0,0,0,0,0,0,0,0,0);const _=1/m;return e[0]=d*_,e[1]=(i*c-h*n)*_,e[2]=(o*n-i*a)*_,e[3]=u*_,e[4]=(h*t-i*l)*_,e[5]=(i*r-o*t)*_,e[6]=f*_,e[7]=(n*l-c*t)*_,e[8]=(a*t-n*r)*_,this}transpose(){let e;const t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){const t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,i,r,a,o){const l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*a+c*o)+a+e,-i*c,i*l,-i*(-c*a+l*o)+o+t,0,0,1),this}scale(e,t){return As("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(dc.makeScale(e,t)),this}rotate(e){return As("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(dc.makeRotation(-e)),this}translate(e,t){return As("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(dc.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){const t=this.elements,n=e.elements;for(let i=0;i<9;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}};du.prototype.isMatrix3=!0;let Ze=du;const dc=new Ze,Gu=new Ze().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Wu=new Ze().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function $m(){const s={enabled:!0,workingColorSpace:Rn,spaces:{},convert:function(i,r,a){return this.enabled===!1||r===a||!r||!a||(this.spaces[r].transfer===_t&&(i.r=Ci(i.r),i.g=Ci(i.g),i.b=Ci(i.b)),this.spaces[r].primaries!==this.spaces[a].primaries&&(i.applyMatrix3(this.spaces[r].toXYZ),i.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===_t&&(i.r=Cs(i.r),i.g=Cs(i.g),i.b=Cs(i.b))),i},workingToColorSpace:function(i,r){return this.convert(i,this.workingColorSpace,r)},colorSpaceToWorking:function(i,r){return this.convert(i,r,this.workingColorSpace)},getPrimaries:function(i){return this.spaces[i].primaries},getTransfer:function(i){return i===Ei?Ha:this.spaces[i].transfer},getToneMappingMode:function(i){return this.spaces[i].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(i,r=this.workingColorSpace){return i.fromArray(this.spaces[r].luminanceCoefficients)},define:function(i){Object.assign(this.spaces,i)},_getMatrix:function(i,r,a){return i.copy(this.spaces[r].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(i){return this.spaces[i].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(i=this.workingColorSpace){return this.spaces[i].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(i,r){return As("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),s.workingToColorSpace(i,r)},toWorkingColorSpace:function(i,r){return As("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),s.colorSpaceToWorking(i,r)}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],n=[.3127,.329];return s.define({[Rn]:{primaries:e,whitePoint:n,transfer:Ha,toXYZ:Gu,fromXYZ:Wu,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:Wt},outputColorSpaceConfig:{drawingBufferColorSpace:Wt}},[Wt]:{primaries:e,whitePoint:n,transfer:_t,toXYZ:Gu,fromXYZ:Wu,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:Wt}}}),s}const st=$m();function Ci(s){return s<.04045?s*.0773993808:Math.pow(s*.9478672986+.0521327014,2.4)}function Cs(s){return s<.0031308?s*12.92:1.055*Math.pow(s,.41666)-.055}let Rs;class Km{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{Rs===void 0&&(Rs=Nr("canvas")),Rs.width=e.width,Rs.height=e.height;const i=Rs.getContext("2d");e instanceof ImageData?i.putImageData(e,0,0):i.drawImage(e,0,0,e.width,e.height),n=Rs}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){const t=Nr("canvas");t.width=e.width,t.height=e.height;const n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);const i=n.getImageData(0,0,e.width,e.height),r=i.data;for(let a=0;a<r.length;a++)r[a]=Ci(r[a]/255)*255;return n.putImageData(i,0,0),t}else if(e.data){const t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(Ci(t[n]/255)*255):t[n]=Ci(t[n]);return{data:t,width:e.width,height:e.height}}else return Fe("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}}let Jm=0;class pc{constructor(e=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:Jm++}),this.uuid=Bn(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){const t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<"u"&&t instanceof VideoFrame?e.set(t.displayWidth,t.displayHeight,0):t!==null?e.set(t.width,t.height,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];const n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let a=0,o=i.length;a<o;a++)i[a].isDataTexture?r.push(mc(i[a].image)):r.push(mc(i[a]))}else r=mc(i);n.url=r}return t||(e.images[this.uuid]=n),n}}function mc(s){return typeof HTMLImageElement<"u"&&s instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&s instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&s instanceof ImageBitmap?Km.getDataURL(s):s.data?{data:Array.from(s.data),width:s.width,height:s.height,type:s.data.constructor.name}:(Fe("Texture: Unable to serialize Texture."),{})}let jm=0;const gc=new L;class Ft extends Gi{constructor(e=Ft.DEFAULT_IMAGE,t=Ft.DEFAULT_MAPPING,n=Fn,i=Fn,r=Gt,a=Ti,o=Cn,l=vn,c=Ft.DEFAULT_ANISOTROPY,h=Ei){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:jm++}),this.uuid=Bn(),this.name="",this.source=new pc(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new pe(0,0),this.repeat=new pe(1,1),this.center=new pe(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Ze,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(gc).x}get height(){return this.source.getSize(gc).y}get depth(){return this.source.getSize(gc).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(const t in e){const n=e[t];if(n===void 0){Fe(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}const i=this[t];if(i===void 0){Fe(`Texture.setValues(): property '${t}' does not exist.`);continue}i&&n&&i.isVector2&&n.isVector2||i&&n&&i.isVector3&&n.isVector3||i&&n&&i.isMatrix3&&n.isMatrix3?i.copy(n):this[t]=n}}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];const n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==bu)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case bn:e.x=e.x-Math.floor(e.x);break;case Fn:e.x=e.x<0?0:1;break;case Da:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case bn:e.y=e.y-Math.floor(e.y);break;case Fn:e.y=e.y<0?0:1;break;case Da:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}}Ft.DEFAULT_IMAGE=null,Ft.DEFAULT_MAPPING=bu,Ft.DEFAULT_ANISOTROPY=1;const pu=class pu{constructor(e=0,t=0,n=0,i=1){this.x=e,this.y=t,this.z=n,this.w=i}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,i){return this.x=e,this.y=t,this.z=n,this.w=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("THREE.Vector4: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){const t=this.x,n=this.y,i=this.z,r=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*i+a[12]*r,this.y=a[1]*t+a[5]*n+a[9]*i+a[13]*r,this.z=a[2]*t+a[6]*n+a[10]*i+a[14]*r,this.w=a[3]*t+a[7]*n+a[11]*i+a[15]*r,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);const t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,i,r;const l=e.elements,c=l[0],h=l[4],d=l[8],u=l[1],f=l[5],m=l[9],_=l[2],p=l[6],g=l[10];if(Math.abs(h-u)<.01&&Math.abs(d-_)<.01&&Math.abs(m-p)<.01){if(Math.abs(h+u)<.1&&Math.abs(d+_)<.1&&Math.abs(m+p)<.1&&Math.abs(c+f+g-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;const M=(c+1)/2,x=(f+1)/2,w=(g+1)/2,S=(h+u)/4,A=(d+_)/4,y=(m+p)/4;return M>x&&M>w?M<.01?(n=0,i=.707106781,r=.707106781):(n=Math.sqrt(M),i=S/n,r=A/n):x>w?x<.01?(n=.707106781,i=0,r=.707106781):(i=Math.sqrt(x),n=S/i,r=y/i):w<.01?(n=.707106781,i=.707106781,r=0):(r=Math.sqrt(w),n=A/r,i=y/r),this.set(n,i,r,t),this}let v=Math.sqrt((p-m)*(p-m)+(d-_)*(d-_)+(u-h)*(u-h));return Math.abs(v)<.001&&(v=1),this.x=(p-m)/v,this.y=(d-_)/v,this.z=(u-h)/v,this.w=Math.acos((c+f+g-1)/2),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Je(this.x,e.x,t.x),this.y=Je(this.y,e.y,t.y),this.z=Je(this.z,e.z,t.z),this.w=Je(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=Je(this.x,e,t),this.y=Je(this.y,e,t),this.z=Je(this.z,e,t),this.w=Je(this.w,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Je(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}};pu.prototype.isVector4=!0;let Mt=pu;class Qm extends Gi{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Gt,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new Mt(0,0,e,t),this.scissorTest=!1,this.viewport=new Mt(0,0,e,t),this.textures=[];const i={width:e,height:t,depth:n.depth},r=new Ft(i),a=n.count;for(let o=0;o<a;o++)this.textures[o]=r.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveColorBuffer=n.resolveColorBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.storeMultisampledColorBuffer=n.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=n.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=n.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(e={}){const t={minFilter:Gt,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&this._depthTexture.renderTarget===this&&(this._depthTexture.renderTarget=null),e!==null&&e.renderTarget===null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let i=0,r=this.textures.length;i<r;i++)this.textures[i].image.width=e,this.textures[i].image.height=t,this.textures[i].image.depth=n,this.textures[i].isData3DTexture!==!0&&(this.textures[i].isArrayTexture=this.textures[i].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;const i=Object.assign({},e.textures[t].image);this.textures[t].source=new pc(i)}if(this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveColorBuffer=e.resolveColorBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,this.storeMultisampledColorBuffer=e.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=e.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=e.storeMultisampledStencilBuffer,e.depthTexture!==null)if(e.depthTexture.renderTarget===e){const t=e.depthTexture.clone();t.renderTarget=null,this.depthTexture=t}else this.depthTexture=e.depthTexture;return this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}}class on extends Qm{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}}class Xu extends Ft{constructor(e=null,t=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=Ht,this.minFilter=Ht,this.wrapR=Fn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class e0 extends Ft{constructor(e=null,t=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=Ht,this.minFilter=Ht,this.wrapR=Fn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}}const rl=class rl{constructor(e,t,n,i,r,a,o,l,c,h,d,u,f,m,_,p){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,i,r,a,o,l,c,h,d,u,f,m,_,p)}set(e,t,n,i,r,a,o,l,c,h,d,u,f,m,_,p){const g=this.elements;return g[0]=e,g[4]=t,g[8]=n,g[12]=i,g[1]=r,g[5]=a,g[9]=o,g[13]=l,g[2]=c,g[6]=h,g[10]=d,g[14]=u,g[3]=f,g[7]=m,g[11]=_,g[15]=p,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new rl().fromArray(this.elements)}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){const t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){const t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinantAffine()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();const t=this.elements,n=e.elements,i=1/Ps.setFromMatrixColumn(e,0).length(),r=1/Ps.setFromMatrixColumn(e,1).length(),a=1/Ps.setFromMatrixColumn(e,2).length();return t[0]=n[0]*i,t[1]=n[1]*i,t[2]=n[2]*i,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){const t=this.elements,n=e.x,i=e.y,r=e.z,a=Math.cos(n),o=Math.sin(n),l=Math.cos(i),c=Math.sin(i),h=Math.cos(r),d=Math.sin(r);if(e.order==="XYZ"){const u=a*h,f=a*d,m=o*h,_=o*d;t[0]=l*h,t[4]=-l*d,t[8]=c,t[1]=f+m*c,t[5]=u-_*c,t[9]=-o*l,t[2]=_-u*c,t[6]=m+f*c,t[10]=a*l}else if(e.order==="YXZ"){const u=l*h,f=l*d,m=c*h,_=c*d;t[0]=u+_*o,t[4]=m*o-f,t[8]=a*c,t[1]=a*d,t[5]=a*h,t[9]=-o,t[2]=f*o-m,t[6]=_+u*o,t[10]=a*l}else if(e.order==="ZXY"){const u=l*h,f=l*d,m=c*h,_=c*d;t[0]=u-_*o,t[4]=-a*d,t[8]=m+f*o,t[1]=f+m*o,t[5]=a*h,t[9]=_-u*o,t[2]=-a*c,t[6]=o,t[10]=a*l}else if(e.order==="ZYX"){const u=a*h,f=a*d,m=o*h,_=o*d;t[0]=l*h,t[4]=m*c-f,t[8]=u*c+_,t[1]=l*d,t[5]=_*c+u,t[9]=f*c-m,t[2]=-c,t[6]=o*l,t[10]=a*l}else if(e.order==="YZX"){const u=a*l,f=a*c,m=o*l,_=o*c;t[0]=l*h,t[4]=_-u*d,t[8]=m*d+f,t[1]=d,t[5]=a*h,t[9]=-o*h,t[2]=-c*h,t[6]=f*d+m,t[10]=u-_*d}else if(e.order==="XZY"){const u=a*l,f=a*c,m=o*l,_=o*c;t[0]=l*h,t[4]=-d,t[8]=c*h,t[1]=u*d+_,t[5]=a*h,t[9]=f*d-m,t[2]=m*d-f,t[6]=o*h,t[10]=_*d+u}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(t0,e,n0)}lookAt(e,t,n){const i=this.elements;return Pn.subVectors(e,t),Pn.lengthSq()===0&&(Pn.z=1),Pn.normalize(),Wi.crossVectors(n,Pn),Wi.lengthSq()===0&&(Math.abs(n.z)===1?Pn.x+=1e-4:Pn.z+=1e-4,Pn.normalize(),Wi.crossVectors(n,Pn)),Wi.normalize(),Xa.crossVectors(Pn,Wi),i[0]=Wi.x,i[4]=Xa.x,i[8]=Pn.x,i[1]=Wi.y,i[5]=Xa.y,i[9]=Pn.y,i[2]=Wi.z,i[6]=Xa.z,i[10]=Pn.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,i=t.elements,r=this.elements,a=n[0],o=n[4],l=n[8],c=n[12],h=n[1],d=n[5],u=n[9],f=n[13],m=n[2],_=n[6],p=n[10],g=n[14],v=n[3],M=n[7],x=n[11],w=n[15],S=i[0],A=i[4],y=i[8],T=i[12],C=i[1],P=i[5],D=i[9],U=i[13],R=i[2],B=i[6],V=i[10],q=i[14],se=i[3],$=i[7],ee=i[11],ue=i[15];return r[0]=a*S+o*C+l*R+c*se,r[4]=a*A+o*P+l*B+c*$,r[8]=a*y+o*D+l*V+c*ee,r[12]=a*T+o*U+l*q+c*ue,r[1]=h*S+d*C+u*R+f*se,r[5]=h*A+d*P+u*B+f*$,r[9]=h*y+d*D+u*V+f*ee,r[13]=h*T+d*U+u*q+f*ue,r[2]=m*S+_*C+p*R+g*se,r[6]=m*A+_*P+p*B+g*$,r[10]=m*y+_*D+p*V+g*ee,r[14]=m*T+_*U+p*q+g*ue,r[3]=v*S+M*C+x*R+w*se,r[7]=v*A+M*P+x*B+w*$,r[11]=v*y+M*D+x*V+w*ee,r[15]=v*T+M*U+x*q+w*ue,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[4],i=e[8],r=e[12],a=e[1],o=e[5],l=e[9],c=e[13],h=e[2],d=e[6],u=e[10],f=e[14],m=e[3],_=e[7],p=e[11],g=e[15],v=l*f-c*u,M=o*f-c*d,x=o*u-l*d,w=a*f-c*h,S=a*u-l*h,A=a*d-o*h;return t*(_*v-p*M+g*x)-n*(m*v-p*w+g*S)+i*(m*M-_*w+g*A)-r*(m*x-_*S+p*A)}determinantAffine(){const e=this.elements,t=e[0],n=e[4],i=e[8],r=e[1],a=e[5],o=e[9],l=e[2],c=e[6],h=e[10];return t*(a*h-o*c)-n*(r*h-o*l)+i*(r*c-a*l)}transpose(){const e=this.elements;let t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){const i=this.elements;return e.isVector3?(i[12]=e.x,i[13]=e.y,i[14]=e.z):(i[12]=e,i[13]=t,i[14]=n),this}invert(){const e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],d=e[9],u=e[10],f=e[11],m=e[12],_=e[13],p=e[14],g=e[15],v=t*o-n*a,M=t*l-i*a,x=t*c-r*a,w=n*l-i*o,S=n*c-r*o,A=i*c-r*l,y=h*_-d*m,T=h*p-u*m,C=h*g-f*m,P=d*p-u*_,D=d*g-f*_,U=u*g-f*p,R=v*U-M*D+x*P+w*C-S*T+A*y;if(R===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const B=1/R;return e[0]=(o*U-l*D+c*P)*B,e[1]=(i*D-n*U-r*P)*B,e[2]=(_*A-p*S+g*w)*B,e[3]=(u*S-d*A-f*w)*B,e[4]=(l*C-a*U-c*T)*B,e[5]=(t*U-i*C+r*T)*B,e[6]=(p*x-m*A-g*M)*B,e[7]=(h*A-u*x+f*M)*B,e[8]=(a*D-o*C+c*y)*B,e[9]=(n*C-t*D-r*y)*B,e[10]=(m*S-_*x+g*v)*B,e[11]=(d*x-h*S-f*v)*B,e[12]=(o*T-a*P-l*y)*B,e[13]=(t*P-n*T+i*y)*B,e[14]=(_*M-m*w-p*v)*B,e[15]=(h*w-d*M+u*v)*B,this}scale(e){const t=this.elements,n=e.x,i=e.y,r=e.z;return t[0]*=n,t[4]*=i,t[8]*=r,t[1]*=n,t[5]*=i,t[9]*=r,t[2]*=n,t[6]*=i,t[10]*=r,t[3]*=n,t[7]*=i,t[11]*=r,this}getMaxScaleOnAxis(){const e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],i=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,i))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){const t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){const n=Math.cos(t),i=Math.sin(t),r=1-n,a=e.x,o=e.y,l=e.z,c=r*a,h=r*o;return this.set(c*a+n,c*o-i*l,c*l+i*o,0,c*o+i*l,h*o+n,h*l-i*a,0,c*l-i*o,h*l+i*a,r*l*l+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,i,r,a){return this.set(1,n,r,0,e,1,a,0,t,i,1,0,0,0,0,1),this}compose(e,t,n){const i=this.elements,r=t._x,a=t._y,o=t._z,l=t._w,c=r+r,h=a+a,d=o+o,u=r*c,f=r*h,m=r*d,_=a*h,p=a*d,g=o*d,v=l*c,M=l*h,x=l*d,w=n.x,S=n.y,A=n.z;return i[0]=(1-(_+g))*w,i[1]=(f+x)*w,i[2]=(m-M)*w,i[3]=0,i[4]=(f-x)*S,i[5]=(1-(u+g))*S,i[6]=(p+v)*S,i[7]=0,i[8]=(m+M)*A,i[9]=(p-v)*A,i[10]=(1-(u+_))*A,i[11]=0,i[12]=e.x,i[13]=e.y,i[14]=e.z,i[15]=1,this}decompose(e,t,n){const i=this.elements;e.x=i[12],e.y=i[13],e.z=i[14];const r=this.determinantAffine();if(r===0)return n.set(1,1,1),t.identity(),this;let a=Ps.set(i[0],i[1],i[2]).length();const o=Ps.set(i[4],i[5],i[6]).length(),l=Ps.set(i[8],i[9],i[10]).length();r<0&&(a=-a),Qn.copy(this);const c=1/a,h=1/o,d=1/l;return Qn.elements[0]*=c,Qn.elements[1]*=c,Qn.elements[2]*=c,Qn.elements[4]*=h,Qn.elements[5]*=h,Qn.elements[6]*=h,Qn.elements[8]*=d,Qn.elements[9]*=d,Qn.elements[10]*=d,t.setFromRotationMatrix(Qn),n.x=a,n.y=o,n.z=l,this}makePerspective(e,t,n,i,r,a,o=ci,l=!1){const c=this.elements,h=2*r/(t-e),d=2*r/(n-i),u=(t+e)/(t-e),f=(n+i)/(n-i);let m,_;if(l)m=r/(a-r),_=a*r/(a-r);else if(o===ci)m=-(a+r)/(a-r),_=-2*a*r/(a-r);else if(o===Ur)m=-a/(a-r),_=-a*r/(a-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=u,c[12]=0,c[1]=0,c[5]=d,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=m,c[14]=_,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,i,r,a,o=ci,l=!1){const c=this.elements,h=2/(t-e),d=2/(n-i),u=-(t+e)/(t-e),f=-(n+i)/(n-i);let m,_;if(l)m=1/(a-r),_=a/(a-r);else if(o===ci)m=-2/(a-r),_=-(a+r)/(a-r);else if(o===Ur)m=-1/(a-r),_=-r/(a-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=0,c[12]=u,c[1]=0,c[5]=d,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=m,c[14]=_,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){const t=this.elements,n=e.elements;for(let i=0;i<16;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}};rl.prototype.isMatrix4=!0;let De=rl;const Ps=new L,Qn=new De,t0=new L(0,0,0),n0=new L(1,1,1),Wi=new L,Xa=new L,Pn=new L,Yu=new De,qu=new Jt;class kn{constructor(e=0,t=0,n=0,i=kn.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,i=this._order){return this._x=e,this._y=t,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){const i=e.elements,r=i[0],a=i[4],o=i[8],l=i[1],c=i[5],h=i[9],d=i[2],u=i[6],f=i[10];switch(t){case"XYZ":this._y=Math.asin(Je(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-h,f),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(u,c),this._z=0);break;case"YXZ":this._x=Math.asin(-Je(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-d,r),this._z=0);break;case"ZXY":this._x=Math.asin(Je(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(-d,f),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-Je(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(u,f),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(Je(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-d,r)):(this._x=0,this._y=Math.atan2(o,f));break;case"XZY":this._z=Math.asin(-Je(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(u,c),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-h,f),this._y=0);break;default:Fe("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return Yu.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Yu,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return qu.setFromEuler(this),this.setFromQuaternion(qu,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}kn.DEFAULT_ORDER="XYZ";class xc{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}}let i0=0;const Zu=new L,Is=new Jt,Ri=new De,Ya=new L,Or=new L,s0=new L,r0=new Jt,$u=new L(1,0,0),Ku=new L(0,1,0),Ju=new L(0,0,1),ju={type:"added"},a0={type:"removed"},Ls={type:"childadded",child:null},vc={type:"childremoved",child:null};class Lt extends Gi{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:i0++}),this.uuid=Bn(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=Lt.DEFAULT_UP.clone();const e=new L,t=new kn,n=new Jt,i=new L(1,1,1);function r(){n.setFromEuler(t,!1)}function a(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new De},normalMatrix:{value:new Ze}}),this.matrix=new De,this.matrixWorld=new De,this.matrixAutoUpdate=Lt.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=Lt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new xc,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Is.setFromAxisAngle(e,t),this.quaternion.multiply(Is),this}rotateOnWorldAxis(e,t){return Is.setFromAxisAngle(e,t),this.quaternion.premultiply(Is),this}rotateX(e){return this.rotateOnAxis($u,e)}rotateY(e){return this.rotateOnAxis(Ku,e)}rotateZ(e){return this.rotateOnAxis(Ju,e)}translateOnAxis(e,t){return Zu.copy(e).applyQuaternion(this.quaternion),this.position.add(Zu.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis($u,e)}translateY(e){return this.translateOnAxis(Ku,e)}translateZ(e){return this.translateOnAxis(Ju,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Ri.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?Ya.copy(e):Ya.set(e,t,n);const i=this.parent;this.updateWorldMatrix(!0,!1),Or.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Ri.lookAt(Or,Ya,this.up):Ri.lookAt(Ya,Or,this.up),this.quaternion.setFromRotationMatrix(Ri),i&&(Ri.extractRotation(i.matrixWorld),Is.setFromRotationMatrix(Ri),this.quaternion.premultiply(Is.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(He("Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(ju),Ls.child=e,this.dispatchEvent(Ls),Ls.child=null):He("Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(a0),vc.child=e,this.dispatchEvent(vc),vc.child=null),this}removeFromParent(){const e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),Ri.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),Ri.multiply(e.parent.matrixWorld)),e.applyMatrix4(Ri),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(ju),Ls.child=e,this.dispatchEvent(Ls),Ls.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,i=this.children.length;n<i;n++){const a=this.children[n].getObjectByProperty(e,t);if(a!==void 0)return a}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);const i=this.children;for(let r=0,a=i.length;r<a;r++)i[r].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Or,e,s0),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Or,r0,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);const t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}intersectsFrustum(){}traverse(e){e(this);const t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);const t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverseVisible(e)}traverseAncestors(e){const t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);const e=this.pivot;if(e!==null){const t=e.x,n=e.y,i=e.z,r=this.matrix.elements;r[12]+=t-r[0]*t-r[4]*n-r[8]*i,r[13]+=n-r[1]*t-r[5]*n-r[9]*i,r[14]+=i-r[2]*t-r[6]*n-r[10]*i}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);const t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t,n=!1){const i=this.parent;if(e===!0&&i!==null&&i.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),t===!0){const r=this.children;for(let a=0,o=r.length;a<o;a++)r[a].updateWorldMatrix(!1,!0,n)}}toJSON(e){const t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const i={};i.uuid=this.uuid,i.type=this.type,i.name=this.name,i.castShadow=this.castShadow,i.receiveShadow=this.receiveShadow,i.visible=this.visible,i.frustumCulled=this.frustumCulled,i.renderOrder=this.renderOrder,i.static=this.static,i.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.pivot!==null&&(i.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(i.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(i.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),i.instanceInfo=this._instanceInfo.map(o=>({...o})),i.availableInstanceIds=this._availableInstanceIds.slice(),i.availableGeometryIds=this._availableGeometryIds.slice(),i.nextIndexStart=this._nextIndexStart,i.nextVertexStart=this._nextVertexStart,i.geometryCount=this._geometryCount,i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.matricesTexture=this._matricesTexture.toJSON(e),i.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(i.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(i.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(i.boundingBox=this.boundingBox.toJSON()));function r(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(e)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(e.geometries,this.geometry);const o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){const l=o.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){const d=l[c];r(e.shapes,d)}else r(e.shapes,l)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(r(e.materials,this.material[l]));i.material=o}else i.material=r(e.materials,this.material);if(this.children.length>0){i.children=[];for(let o=0;o<this.children.length;o++)i.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){i.animations=[];for(let o=0;o<this.animations.length;o++){const l=this.animations[o];i.animations.push(r(e.animations,l))}}if(t){const o=a(e.geometries),l=a(e.materials),c=a(e.textures),h=a(e.images),d=a(e.shapes),u=a(e.skeletons),f=a(e.animations),m=a(e.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),d.length>0&&(n.shapes=d),u.length>0&&(n.skeletons=u),f.length>0&&(n.animations=f),m.length>0&&(n.nodes=m)}return n.object=i,n;function a(o){const l=[];for(const c in o){const h=o[c];delete h.metadata,l.push(h)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot!==null?e.pivot.clone():null,this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){const i=e.children[n];this.add(i.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}}Lt.DEFAULT_UP=new L(0,1,0),Lt.DEFAULT_MATRIX_AUTO_UPDATE=!0,Lt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;class Xt extends Lt{constructor(){super(),this.isGroup=!0,this.type="Group"}}const o0={type:"move"};class _c{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Xt,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Xt,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new L,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new L),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Xt,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new L,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new L,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){const t=this._hand;if(t)for(const n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let i=null,r=null,a=null;const o=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){a=!0;for(const _ of e.hand.values()){const p=t.getJointPose(_,n),g=this._getHandJoint(c,_);p!==null&&(g.matrix.fromArray(p.transform.matrix),g.matrix.decompose(g.position,g.rotation,g.scale),g.matrixWorldNeedsUpdate=!0,g.jointRadius=p.radius),g.visible=p!==null}const h=c.joints["index-finger-tip"],d=c.joints["thumb-tip"],u=h.position.distanceTo(d.position),f=.02,m=.005;c.inputState.pinching&&u>f+m?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&u<=f-m&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:e,target:this})));o!==null&&(i=t.getPose(e.targetRaySpace,n),i===null&&r!==null&&(i=r),i!==null&&(o.matrix.fromArray(i.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,i.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(i.linearVelocity)):o.hasLinearVelocity=!1,i.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(i.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(o0)))}return o!==null&&(o.visible=i!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){const n=new Xt;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}}const Qu={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Xi={h:0,s:0,l:0},qa={h:0,s:0,l:0};function Mc(s,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?s+(e-s)*6*t:t<1/2?e:t<2/3?s+(e-s)*6*(2/3-t):s}class ge{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){const i=e;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=Wt){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,st.colorSpaceToWorking(this,t),this}setRGB(e,t,n,i=st.workingColorSpace){return this.r=e,this.g=t,this.b=n,st.colorSpaceToWorking(this,i),this}setHSL(e,t,n,i=st.workingColorSpace){if(e=uc(e,1),t=Je(t,0,1),n=Je(n,0,1),t===0)this.r=this.g=this.b=n;else{const r=n<=.5?n*(1+t):n+t-n*t,a=2*n-r;this.r=Mc(a,r,e+1/3),this.g=Mc(a,r,e),this.b=Mc(a,r,e-1/3)}return st.colorSpaceToWorking(this,i),this}setStyle(e,t=Wt){function n(r){r!==void 0&&parseFloat(r)<1&&Fe("Color: Alpha component of "+e+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(e)){let r;const a=i[1],o=i[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,t);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:Fe("Color: Unknown color model "+e)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(e)){const r=i[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);if(a===6)return this.setHex(parseInt(r,16),t);Fe("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=Wt){const n=Qu[e.toLowerCase()];return n!==void 0?this.setHex(n,t):Fe("Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=Ci(e.r),this.g=Ci(e.g),this.b=Ci(e.b),this}copyLinearToSRGB(e){return this.r=Cs(e.r),this.g=Cs(e.g),this.b=Cs(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=Wt){return st.workingToColorSpace(mn.copy(this),e),Math.round(Je(mn.r*255,0,255))*65536+Math.round(Je(mn.g*255,0,255))*256+Math.round(Je(mn.b*255,0,255))}getHexString(e=Wt){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=st.workingColorSpace){st.workingToColorSpace(mn.copy(this),t);const n=mn.r,i=mn.g,r=mn.b,a=Math.max(n,i,r),o=Math.min(n,i,r);let l,c;const h=(o+a)/2;if(o===a)l=0,c=0;else{const d=a-o;switch(c=h<=.5?d/(a+o):d/(2-a-o),a){case n:l=(i-r)/d+(i<r?6:0);break;case i:l=(r-n)/d+2;break;case r:l=(n-i)/d+4;break}l/=6}return e.h=l,e.s=c,e.l=h,e}getRGB(e,t=st.workingColorSpace){return st.workingToColorSpace(mn.copy(this),t),e.r=mn.r,e.g=mn.g,e.b=mn.b,e}getStyle(e=Wt){st.workingToColorSpace(mn.copy(this),e);const t=mn.r,n=mn.g,i=mn.b;return e!==Wt?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(e,t,n){return this.getHSL(Xi),this.setHSL(Xi.h+e,Xi.s+t,Xi.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(Xi),e.getHSL(qa);const n=Fr(Xi.h,qa.h,t),i=Fr(Xi.s,qa.s,t),r=Fr(Xi.l,qa.l,t);return this.setHSL(n,i,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){const t=this.r,n=this.g,i=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*i,this.g=r[1]*t+r[4]*n+r[7]*i,this.b=r[2]*t+r[5]*n+r[8]*i,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const mn=new ge;ge.NAMES=Qu;class Br{constructor(e,t=1,n=1e3){this.isFog=!0,this.name="",this.color=new ge(e),this.near=t,this.far=n}clone(){return new Br(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}}class l0 extends Lt{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new kn,this.environmentIntensity=1,this.environmentRotation=new kn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){const t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),t.object.backgroundBlurriness=this.backgroundBlurriness,t.object.backgroundIntensity=this.backgroundIntensity,t.object.backgroundRotation=this.backgroundRotation.toArray(),t.object.environmentIntensity=this.environmentIntensity,t.object.environmentRotation=this.environmentRotation.toArray(),t}}const ei=new L,Pi=new L,yc=new L,Ii=new L,Ds=new L,Us=new L,ef=new L,Sc=new L,wc=new L,bc=new L,Tc=new Mt,Ac=new Mt,Ec=new Mt;class Vn{constructor(e=new L,t=new L,n=new L){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,i){i.subVectors(n,t),ei.subVectors(e,t),i.cross(ei);const r=i.lengthSq();return r>0?i.multiplyScalar(1/Math.sqrt(r)):i.set(0,0,0)}static getBarycoord(e,t,n,i,r){ei.subVectors(i,t),Pi.subVectors(n,t),yc.subVectors(e,t);const a=ei.dot(ei),o=ei.dot(Pi),l=ei.dot(yc),c=Pi.dot(Pi),h=Pi.dot(yc),d=a*c-o*o;if(d===0)return r.set(0,0,0),null;const u=1/d,f=(c*l-o*h)*u,m=(a*h-o*l)*u;return r.set(1-f-m,m,f)}static containsPoint(e,t,n,i){return this.getBarycoord(e,t,n,i,Ii)===null?!1:Ii.x>=0&&Ii.y>=0&&Ii.x+Ii.y<=1}static getInterpolation(e,t,n,i,r,a,o,l){return this.getBarycoord(e,t,n,i,Ii)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,Ii.x),l.addScaledVector(a,Ii.y),l.addScaledVector(o,Ii.z),l)}static getInterpolatedAttribute(e,t,n,i,r,a){return Tc.setScalar(0),Ac.setScalar(0),Ec.setScalar(0),Tc.fromBufferAttribute(e,t),Ac.fromBufferAttribute(e,n),Ec.fromBufferAttribute(e,i),a.setScalar(0),a.addScaledVector(Tc,r.x),a.addScaledVector(Ac,r.y),a.addScaledVector(Ec,r.z),a}static isFrontFacing(e,t,n,i){return ei.subVectors(n,t),Pi.subVectors(e,t),ei.cross(Pi).dot(i)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,i){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[i]),this}setFromAttributeAndIndices(e,t,n,i){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,i),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return ei.subVectors(this.c,this.b),Pi.subVectors(this.a,this.b),ei.cross(Pi).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return Vn.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return Vn.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,i,r){return Vn.getInterpolation(e,this.a,this.b,this.c,t,n,i,r)}containsPoint(e){return Vn.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return Vn.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){const n=this.a,i=this.b,r=this.c;let a,o;Ds.subVectors(i,n),Us.subVectors(r,n),Sc.subVectors(e,n);const l=Ds.dot(Sc),c=Us.dot(Sc);if(l<=0&&c<=0)return t.copy(n);wc.subVectors(e,i);const h=Ds.dot(wc),d=Us.dot(wc);if(h>=0&&d<=h)return t.copy(i);const u=l*d-h*c;if(u<=0&&l>=0&&h<=0)return a=l/(l-h),t.copy(n).addScaledVector(Ds,a);bc.subVectors(e,r);const f=Ds.dot(bc),m=Us.dot(bc);if(m>=0&&f<=m)return t.copy(r);const _=f*c-l*m;if(_<=0&&c>=0&&m<=0)return o=c/(c-m),t.copy(n).addScaledVector(Us,o);const p=h*m-f*d;if(p<=0&&d-h>=0&&f-m>=0)return ef.subVectors(r,i),o=(d-h)/(d-h+(f-m)),t.copy(i).addScaledVector(ef,o);const g=1/(p+_+u);return a=_*g,o=u*g,t.copy(n).addScaledVector(Ds,a).addScaledVector(Us,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}class Li{constructor(e=new L(1/0,1/0,1/0),t=new L(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(ti.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(ti.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){const n=ti.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);const n=e.geometry;if(n!==void 0){const r=n.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let a=0,o=r.count;a<o;a++)e.isMesh===!0?e.getVertexPosition(a,ti):ti.fromBufferAttribute(r,a),ti.applyMatrix4(e.matrixWorld),this.expandByPoint(ti);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),Za.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Za.copy(n.boundingBox)),Za.applyMatrix4(e.matrixWorld),this.union(Za)}const i=e.children;for(let r=0,a=i.length;r<a;r++)this.expandByObject(i[r],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,ti),ti.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(kr),$a.subVectors(this.max,kr),Ns.subVectors(e.a,kr),zs.subVectors(e.b,kr),Fs.subVectors(e.c,kr),Yi.subVectors(zs,Ns),qi.subVectors(Fs,zs),ss.subVectors(Ns,Fs);let t=[0,-Yi.z,Yi.y,0,-qi.z,qi.y,0,-ss.z,ss.y,Yi.z,0,-Yi.x,qi.z,0,-qi.x,ss.z,0,-ss.x,-Yi.y,Yi.x,0,-qi.y,qi.x,0,-ss.y,ss.x,0];return!Cc(t,Ns,zs,Fs,$a)||(t=[1,0,0,0,1,0,0,0,1],!Cc(t,Ns,zs,Fs,$a))?!1:(Ka.crossVectors(Yi,qi),t=[Ka.x,Ka.y,Ka.z],Cc(t,Ns,zs,Fs,$a))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,ti).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(ti).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(Di[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),Di[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),Di[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),Di[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),Di[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),Di[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),Di[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),Di[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(Di),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}}const Di=[new L,new L,new L,new L,new L,new L,new L,new L],ti=new L,Za=new Li,Ns=new L,zs=new L,Fs=new L,Yi=new L,qi=new L,ss=new L,kr=new L,$a=new L,Ka=new L,rs=new L;function Cc(s,e,t,n,i){for(let r=0,a=s.length-3;r<=a;r+=3){rs.fromArray(s,r);const o=i.x*Math.abs(rs.x)+i.y*Math.abs(rs.y)+i.z*Math.abs(rs.z),l=e.dot(rs),c=t.dot(rs),h=n.dot(rs);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>o)return!1}return!0}const Zt=new L,Ja=new pe;let c0=0;class Ot extends Gi{constructor(e,t,n=!1){if(super(),Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:c0++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=Fu,this.updateRanges=[],this.gpuType=On,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[e+i]=t.array[n+i];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)Ja.fromBufferAttribute(this,t),Ja.applyMatrix3(e),this.setXY(t,Ja.x,Ja.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)Zt.fromBufferAttribute(this,t),Zt.applyMatrix3(e),this.setXYZ(t,Zt.x,Zt.y,Zt.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)Zt.fromBufferAttribute(this,t),Zt.applyMatrix4(e),this.setXYZ(t,Zt.x,Zt.y,Zt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Zt.fromBufferAttribute(this,t),Zt.applyNormalMatrix(e),this.setXYZ(t,Zt.x,Zt.y,Zt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Zt.fromBufferAttribute(this,t),Zt.transformDirection(e),this.setXYZ(t,Zt.x,Zt.y,Zt.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=jn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=wt(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=jn(t,this.array)),t}setX(e,t){return this.normalized&&(t=wt(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=jn(t,this.array)),t}setY(e,t){return this.normalized&&(t=wt(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=jn(t,this.array)),t}setZ(e,t){return this.normalized&&(t=wt(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=jn(t,this.array)),t}setW(e,t){return this.normalized&&(t=wt(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=wt(t,this.array),n=wt(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,i){return e*=this.itemSize,this.normalized&&(t=wt(t,this.array),n=wt(n,this.array),i=wt(i,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this}setXYZW(e,t,n,i,r){return e*=this.itemSize,this.normalized&&(t=wt(t,this.array),n=wt(n,this.array),i=wt(i,this.array),r=wt(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return e.name=this.name,e.usage=this.usage,e.gpuType=this.gpuType,e}dispose(){this.dispatchEvent({type:"dispose"})}}class tf extends Ot{constructor(e,t,n){super(new Uint16Array(e),t,n)}}class nf extends Ot{constructor(e,t,n){super(new Uint32Array(e),t,n)}}class je extends Ot{constructor(e,t,n){super(new Float32Array(e),t,n)}}const h0=new Li,Vr=new L,Rc=new L;class hi{constructor(e=new L,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){const n=this.center;t!==void 0?n.copy(t):h0.setFromPoints(e).getCenter(n);let i=0;for(let r=0,a=e.length;r<a;r++)i=Math.max(i,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(i),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){const t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){const n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Vr.subVectors(e,this.center);const t=Vr.lengthSq();if(t>this.radius*this.radius){const n=Math.sqrt(t),i=(n-this.radius)*.5;this.center.addScaledVector(Vr,i/n),this.radius+=i}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Rc.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Vr.copy(e.center).add(Rc)),this.expandByPoint(Vr.copy(e.center).sub(Rc))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}}let u0=0;const Hn=new De,Pc=new Lt,Os=new L,In=new Li,Hr=new Li,ln=new L;class At extends Gi{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:u0++}),this.uuid=Bn(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(Cm(e)?nf:tf)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){const t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const r=new Ze().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}const i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(e),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(e){return Hn.makeRotationFromQuaternion(e),this.applyMatrix4(Hn),this}rotateX(e){return Hn.makeRotationX(e),this.applyMatrix4(Hn),this}rotateY(e){return Hn.makeRotationY(e),this.applyMatrix4(Hn),this}rotateZ(e){return Hn.makeRotationZ(e),this.applyMatrix4(Hn),this}translate(e,t,n){return Hn.makeTranslation(e,t,n),this.applyMatrix4(Hn),this}scale(e,t,n){return Hn.makeScale(e,t,n),this.applyMatrix4(Hn),this}lookAt(e){return Pc.lookAt(e),Pc.updateMatrix(),this.applyMatrix4(Pc.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Os).negate(),this.translate(Os.x,Os.y,Os.z),this}setFromPoints(e){const t=this.getAttribute("position");if(t===void 0){const n=[];for(let i=0,r=e.length;i<r;i++){const a=e[i];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new je(n,3))}else{const n=Math.min(e.length,t.count);for(let i=0;i<n;i++){const r=e[i];t.setXYZ(i,r.x,r.y,r.z||0)}e.length>t.count&&Fe("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Li);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){He("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new L(-1/0,-1/0,-1/0),new L(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,i=t.length;n<i;n++){const r=t[n];In.setFromBufferAttribute(r),this.morphTargetsRelative?(ln.addVectors(this.boundingBox.min,In.min),this.boundingBox.expandByPoint(ln),ln.addVectors(this.boundingBox.max,In.max),this.boundingBox.expandByPoint(ln)):(this.boundingBox.expandByPoint(In.min),this.boundingBox.expandByPoint(In.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&He('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new hi);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){He("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new L,1/0);return}if(e){const n=this.boundingSphere.center;if(In.setFromBufferAttribute(e),t)for(let r=0,a=t.length;r<a;r++){const o=t[r];Hr.setFromBufferAttribute(o),this.morphTargetsRelative?(ln.addVectors(In.min,Hr.min),In.expandByPoint(ln),ln.addVectors(In.max,Hr.max),In.expandByPoint(ln)):(In.expandByPoint(Hr.min),In.expandByPoint(Hr.max))}In.getCenter(n);let i=0;for(let r=0,a=e.count;r<a;r++)ln.fromBufferAttribute(e,r),i=Math.max(i,n.distanceToSquared(ln));if(t)for(let r=0,a=t.length;r<a;r++){const o=t[r],l=this.morphTargetsRelative;for(let c=0,h=o.count;c<h;c++)ln.fromBufferAttribute(o,c),l&&(Os.fromBufferAttribute(e,c),ln.add(Os)),i=Math.max(i,n.distanceToSquared(ln))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&He('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){He("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const n=t.position,i=t.normal,r=t.uv;let a=this.getAttribute("tangent");(a===void 0||a.count!==n.count)&&(a=new Ot(new Float32Array(4*n.count),4),this.setAttribute("tangent",a));const o=[],l=[];for(let y=0;y<n.count;y++)o[y]=new L,l[y]=new L;const c=new L,h=new L,d=new L,u=new pe,f=new pe,m=new pe,_=new L,p=new L;function g(y,T,C){c.fromBufferAttribute(n,y),h.fromBufferAttribute(n,T),d.fromBufferAttribute(n,C),u.fromBufferAttribute(r,y),f.fromBufferAttribute(r,T),m.fromBufferAttribute(r,C),h.sub(c),d.sub(c),f.sub(u),m.sub(u);const P=1/(f.x*m.y-m.x*f.y);isFinite(P)&&(_.copy(h).multiplyScalar(m.y).addScaledVector(d,-f.y).multiplyScalar(P),p.copy(d).multiplyScalar(f.x).addScaledVector(h,-m.x).multiplyScalar(P),o[y].add(_),o[T].add(_),o[C].add(_),l[y].add(p),l[T].add(p),l[C].add(p))}let v=this.groups;v.length===0&&(v=[{start:0,count:e.count}]);for(let y=0,T=v.length;y<T;++y){const C=v[y],P=C.start,D=C.count;for(let U=P,R=P+D;U<R;U+=3)g(e.getX(U+0),e.getX(U+1),e.getX(U+2))}const M=new L,x=new L,w=new L,S=new L;function A(y){w.fromBufferAttribute(i,y),S.copy(w);const T=o[y];M.copy(T),M.sub(w.multiplyScalar(w.dot(T))).normalize(),x.crossVectors(S,T);const P=x.dot(l[y])<0?-1:1;a.setXYZW(y,M.x,M.y,M.z,P)}for(let y=0,T=v.length;y<T;++y){const C=v[y],P=C.start,D=C.count;for(let U=P,R=P+D;U<R;U+=3)A(e.getX(U+0)),A(e.getX(U+1)),A(e.getX(U+2))}this._transformed=!0}computeVertexNormals(){const e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==t.count)n=new Ot(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let u=0,f=n.count;u<f;u++)n.setXYZ(u,0,0,0);const i=new L,r=new L,a=new L,o=new L,l=new L,c=new L,h=new L,d=new L;if(e)for(let u=0,f=e.count;u<f;u+=3){const m=e.getX(u+0),_=e.getX(u+1),p=e.getX(u+2);i.fromBufferAttribute(t,m),r.fromBufferAttribute(t,_),a.fromBufferAttribute(t,p),h.subVectors(a,r),d.subVectors(i,r),h.cross(d),o.fromBufferAttribute(n,m),l.fromBufferAttribute(n,_),c.fromBufferAttribute(n,p),o.add(h),l.add(h),c.add(h),n.setXYZ(m,o.x,o.y,o.z),n.setXYZ(_,l.x,l.y,l.z),n.setXYZ(p,c.x,c.y,c.z)}else for(let u=0,f=t.count;u<f;u+=3)i.fromBufferAttribute(t,u+0),r.fromBufferAttribute(t,u+1),a.fromBufferAttribute(t,u+2),h.subVectors(a,r),d.subVectors(i,r),h.cross(d),n.setXYZ(u+0,h.x,h.y,h.z),n.setXYZ(u+1,h.x,h.y,h.z),n.setXYZ(u+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)ln.fromBufferAttribute(e,t),ln.normalize(),e.setXYZ(t,ln.x,ln.y,ln.z)}toNonIndexed(){function e(o,l){const c=o.array,h=o.itemSize,d=o.normalized,u=new c.constructor(l.length*h);let f=0,m=0;for(let _=0,p=l.length;_<p;_++){o.isInterleavedBufferAttribute?f=l[_]*o.data.stride+o.offset:f=l[_]*h;for(let g=0;g<h;g++)u[m++]=c[f++]}return new Ot(u,h,d)}if(this.index===null)return Fe("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const t=new At,n=this.index.array,i=this.attributes;for(const o in i){const l=i[o],c=e(l,n);t.setAttribute(o,c)}const r=this.morphAttributes;for(const o in r){const l=[],c=r[o];for(let h=0,d=c.length;h<d;h++){const u=c[h],f=e(u,n);l.push(f)}t.morphAttributes[o]=l}t.morphTargetsRelative=this.morphTargetsRelative;const a=this.groups;for(let o=0,l=a.length;o<l;o++){const c=a[o];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){const e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,e.name=this.name,Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){const l=this.parameters;for(const c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};const t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});const n=this.attributes;for(const l in n){const c=n[l];e.data.attributes[l]=c.toJSON(e.data)}const i={};let r=!1;for(const l in this.morphAttributes){const c=this.morphAttributes[l],h=[];for(let d=0,u=c.length;d<u;d++){const f=c[d];h.push(f.toJSON(e.data))}h.length>0&&(i[l]=h,r=!0)}r&&(e.data.morphAttributes=i,e.data.morphTargetsRelative=this.morphTargetsRelative);const a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));const o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const t={};this.name=e.name;const n=e.index;n!==null&&this.setIndex(n.clone());const i=e.attributes;for(const c in i){const h=i[c];this.setAttribute(c,h.clone(t))}const r=e.morphAttributes;for(const c in r){const h=[],d=r[c];for(let u=0,f=d.length;u<f;u++)h.push(d[u].clone(t));this.morphAttributes[c]=h}this.morphTargetsRelative=e.morphTargetsRelative;const a=e.groups;for(let c=0,h=a.length;c<h;c++){const d=a[c];this.addGroup(d.start,d.count,d.materialIndex)}const o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());const l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}}class sf{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=Fu,this.updateRanges=[],this.version=0,this.uuid=Bn()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let i=0,r=this.stride;i<r;i++)this.array[e+i]=t.array[n+i];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Bn()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);const t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Bn()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer)));const t={uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride};return t.usage=this.usage,t}}const _n=new L;class Gr{constructor(e,t,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)_n.fromBufferAttribute(this,t),_n.applyMatrix4(e),this.setXYZ(t,_n.x,_n.y,_n.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)_n.fromBufferAttribute(this,t),_n.applyNormalMatrix(e),this.setXYZ(t,_n.x,_n.y,_n.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)_n.fromBufferAttribute(this,t),_n.transformDirection(e),this.setXYZ(t,_n.x,_n.y,_n.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(n=jn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=wt(n,this.array)),this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){return this.normalized&&(t=wt(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=wt(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=wt(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=wt(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=jn(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=jn(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=jn(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=jn(t,this.array)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=wt(t,this.array),n=wt(n,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,i){return e=e*this.data.stride+this.offset,this.normalized&&(t=wt(t,this.array),n=wt(n,this.array),i=wt(i,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this}setXYZW(e,t,n,i,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=wt(t,this.array),n=wt(n,this.array),i=wt(i,this.array),r=wt(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this.data.array[e+3]=r,this}clone(e){if(e===void 0){Ga("InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");const t=[];for(let n=0;n<this.count;n++){const i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return new Ot(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new Gr(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){Ga("InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");const t=[];for(let n=0;n<this.count;n++){const i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}const Ic=new L,f0=new L,d0=new Ze;class ui{constructor(e=new L(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,i){return this.normal.set(e,t,n),this.constant=i,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){const i=Ic.subVectors(n,t).cross(f0.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(i,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){const e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,n=!0){const i=e.delta(Ic),r=this.normal.dot(i);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;const a=-(e.start.dot(this.normal)+this.constant)/r;return n===!0&&(a<0||a>1)?null:t.copy(e.start).addScaledVector(i,a)}intersectsLine(e){const t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){const n=t||d0.getNormalMatrix(e),i=this.coplanarPoint(Ic).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(e){return this.normal.fromArray(e.normal),this.constant=e.constant,this}}let p0=0;class Ln extends Gi{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:p0++}),this.uuid=Bn(),this.name="",this.type="Material",this.blending=ws,this.side=ki,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=yu,this.blendDst=Su,this.blendEquation=ai,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new ge(0,0,0),this.blendAlpha=0,this.depthFunc=Cr,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=ym,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=lc,this.stencilZFail=lc,this.stencilZPass=lc,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(const t in e){const n=e[t];if(n===void 0){Fe(`Material: parameter '${t}' has value of undefined.`);continue}const i=this[t];if(i===void 0){Fe(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}i&&i.isColor?i.set(n):i&&i.isVector2&&n&&n.isVector2||i&&i.isEuler&&n&&n.isEuler||i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[t]=n}}toJSON(e){const t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});const n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,n.blending=this.blending,n.side=this.side,n.shadowSide=this.shadowSide,n.vertexColors=this.vertexColors,n.opacity=this.opacity,n.transparent=this.transparent,n.blendSrc=this.blendSrc,n.blendDst=this.blendDst,n.blendEquation=this.blendEquation,n.blendSrcAlpha=this.blendSrcAlpha,n.blendDstAlpha=this.blendDstAlpha,n.blendEquationAlpha=this.blendEquationAlpha,n.blendColor=this.blendColor.getHex(),n.blendAlpha=this.blendAlpha,n.depthFunc=this.depthFunc,n.depthTest=this.depthTest,n.depthWrite=this.depthWrite,n.colorWrite=this.colorWrite,n.clipIntersection=this.clipIntersection,n.clipShadows=this.clipShadows,n.stencilWriteMask=this.stencilWriteMask,n.stencilFunc=this.stencilFunc,n.stencilRef=this.stencilRef,n.stencilFuncMask=this.stencilFuncMask,n.stencilFail=this.stencilFail,n.stencilZFail=this.stencilZFail,n.stencilZPass=this.stencilZPass,n.stencilWrite=this.stencilWrite,n.polygonOffset=this.polygonOffset,n.polygonOffsetFactor=this.polygonOffsetFactor,n.polygonOffsetUnits=this.polygonOffsetUnits,n.dithering=this.dithering,n.alphaTest=this.alphaTest,n.alphaHash=this.alphaHash,n.alphaToCoverage=this.alphaToCoverage,n.premultipliedAlpha=this.premultipliedAlpha,n.forceSinglePass=this.forceSinglePass,n.allowOverride=this.allowOverride,n.visible=this.visible,n.toneMapped=this.toneMapped,n.name=this.name,this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(n.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(n.clippingPlanes=this.clippingPlanes.map(r=>r.toJSON())),this.rotation!==void 0&&(n.rotation=this.rotation),this.depthPacking!==void 0&&(n.depthPacking=this.depthPacking),this.linewidth!==void 0&&(n.linewidth=this.linewidth),this.linecap!==void 0&&(n.linecap=this.linecap),this.linejoin!==void 0&&(n.linejoin=this.linejoin),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.wireframe!==void 0&&(n.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(n.flatShading=this.flatShading),this.fog!==void 0&&(n.fog=this.fog),Object.keys(this.userData).length>0&&(n.userData=this.userData);function i(r){const a=[];for(const o in r){const l=r[o];delete l.metadata,a.push(l)}return a}if(t){const r=i(e.textures),a=i(e.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}fromJSON(e,t){if(e.uuid!==void 0&&(this.uuid=e.uuid),e.name!==void 0&&(this.name=e.name),e.color!==void 0&&this.color!==void 0&&this.color.setHex(e.color),e.roughness!==void 0&&(this.roughness=e.roughness),e.metalness!==void 0&&(this.metalness=e.metalness),e.sheen!==void 0&&(this.sheen=e.sheen),e.sheenColor!==void 0&&(this.sheenColor=new ge().setHex(e.sheenColor)),e.sheenRoughness!==void 0&&(this.sheenRoughness=e.sheenRoughness),e.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(e.emissive),e.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(e.specular),e.specularIntensity!==void 0&&(this.specularIntensity=e.specularIntensity),e.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(e.specularColor),e.shininess!==void 0&&(this.shininess=e.shininess),e.clearcoat!==void 0&&(this.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=e.clearcoatRoughness),e.dispersion!==void 0&&(this.dispersion=e.dispersion),e.retroreflectivity!==void 0&&(this.retroreflectivity=e.retroreflectivity),e.iridescence!==void 0&&(this.iridescence=e.iridescence),e.iridescenceIOR!==void 0&&(this.iridescenceIOR=e.iridescenceIOR),e.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=e.iridescenceThicknessRange),e.transmission!==void 0&&(this.transmission=e.transmission),e.thickness!==void 0&&(this.thickness=e.thickness),e.attenuationDistance!==void 0&&(this.attenuationDistance=e.attenuationDistance),e.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(e.attenuationColor),e.anisotropy!==void 0&&(this.anisotropy=e.anisotropy),e.anisotropyRotation!==void 0&&(this.anisotropyRotation=e.anisotropyRotation),e.fog!==void 0&&(this.fog=e.fog),e.flatShading!==void 0&&(this.flatShading=e.flatShading),e.blending!==void 0&&(this.blending=e.blending),e.combine!==void 0&&(this.combine=e.combine),e.side!==void 0&&(this.side=e.side),e.shadowSide!==void 0&&(this.shadowSide=e.shadowSide),e.opacity!==void 0&&(this.opacity=e.opacity),e.transparent!==void 0&&(this.transparent=e.transparent),e.alphaTest!==void 0&&(this.alphaTest=e.alphaTest),e.alphaHash!==void 0&&(this.alphaHash=e.alphaHash),e.depthFunc!==void 0&&(this.depthFunc=e.depthFunc),e.depthTest!==void 0&&(this.depthTest=e.depthTest),e.depthWrite!==void 0&&(this.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(this.colorWrite=e.colorWrite),e.clippingPlanes!==void 0&&(this.clippingPlanes=e.clippingPlanes.map(n=>new ui().fromJSON(n))),e.clipIntersection!==void 0&&(this.clipIntersection=e.clipIntersection),e.clipShadows!==void 0&&(this.clipShadows=e.clipShadows),e.depthPacking!==void 0&&(this.depthPacking=e.depthPacking),e.blendSrc!==void 0&&(this.blendSrc=e.blendSrc),e.blendDst!==void 0&&(this.blendDst=e.blendDst),e.blendEquation!==void 0&&(this.blendEquation=e.blendEquation),e.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=e.blendSrcAlpha),e.blendDstAlpha!==void 0&&(this.blendDstAlpha=e.blendDstAlpha),e.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=e.blendEquationAlpha),e.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(e.blendColor),e.blendAlpha!==void 0&&(this.blendAlpha=e.blendAlpha),e.stencilWriteMask!==void 0&&(this.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(this.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(this.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(this.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(this.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(this.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(this.stencilZPass=e.stencilZPass),e.stencilWrite!==void 0&&(this.stencilWrite=e.stencilWrite),e.wireframe!==void 0&&(this.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(this.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(this.rotation=e.rotation),e.linewidth!==void 0&&(this.linewidth=e.linewidth),e.linecap!==void 0&&(this.linecap=e.linecap),e.linejoin!==void 0&&(this.linejoin=e.linejoin),e.dashSize!==void 0&&(this.dashSize=e.dashSize),e.gapSize!==void 0&&(this.gapSize=e.gapSize),e.scale!==void 0&&(this.scale=e.scale),e.polygonOffset!==void 0&&(this.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=e.polygonOffsetUnits),e.dithering!==void 0&&(this.dithering=e.dithering),e.alphaToCoverage!==void 0&&(this.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=e.premultipliedAlpha),e.forceSinglePass!==void 0&&(this.forceSinglePass=e.forceSinglePass),e.allowOverride!==void 0&&(this.allowOverride=e.allowOverride),e.visible!==void 0&&(this.visible=e.visible),e.toneMapped!==void 0&&(this.toneMapped=e.toneMapped),e.userData!==void 0&&(this.userData=e.userData),e.vertexColors!==void 0&&(typeof e.vertexColors=="number"?this.vertexColors=e.vertexColors>0:this.vertexColors=e.vertexColors),e.size!==void 0&&(this.size=e.size),e.sizeAttenuation!==void 0&&(this.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(this.map=t[e.map]||null),e.matcap!==void 0&&(this.matcap=t[e.matcap]||null),e.alphaMap!==void 0&&(this.alphaMap=t[e.alphaMap]||null),e.bumpMap!==void 0&&(this.bumpMap=t[e.bumpMap]||null),e.bumpScale!==void 0&&(this.bumpScale=e.bumpScale),e.normalMap!==void 0&&(this.normalMap=t[e.normalMap]||null),e.normalMapType!==void 0&&(this.normalMapType=e.normalMapType),e.normalScale!==void 0){let n=e.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new pe().fromArray(n)}return e.displacementMap!==void 0&&(this.displacementMap=t[e.displacementMap]||null),e.displacementScale!==void 0&&(this.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(this.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(this.roughnessMap=t[e.roughnessMap]||null),e.metalnessMap!==void 0&&(this.metalnessMap=t[e.metalnessMap]||null),e.emissiveMap!==void 0&&(this.emissiveMap=t[e.emissiveMap]||null),e.emissiveIntensity!==void 0&&(this.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(this.specularMap=t[e.specularMap]||null),e.specularIntensityMap!==void 0&&(this.specularIntensityMap=t[e.specularIntensityMap]||null),e.specularColorMap!==void 0&&(this.specularColorMap=t[e.specularColorMap]||null),e.envMap!==void 0&&(this.envMap=t[e.envMap]||null),e.envMapRotation!==void 0&&this.envMapRotation.fromArray(e.envMapRotation),e.envMapIntensity!==void 0&&(this.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(this.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(this.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(this.lightMap=t[e.lightMap]||null),e.lightMapIntensity!==void 0&&(this.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(this.aoMap=t[e.aoMap]||null),e.aoMapIntensity!==void 0&&(this.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(this.gradientMap=t[e.gradientMap]||null),e.clearcoatMap!==void 0&&(this.clearcoatMap=t[e.clearcoatMap]||null),e.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null),e.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null),e.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new pe().fromArray(e.clearcoatNormalScale)),e.iridescenceMap!==void 0&&(this.iridescenceMap=t[e.iridescenceMap]||null),e.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null),e.transmissionMap!==void 0&&(this.transmissionMap=t[e.transmissionMap]||null),e.thicknessMap!==void 0&&(this.thicknessMap=t[e.thicknessMap]||null),e.anisotropyMap!==void 0&&(this.anisotropyMap=t[e.anisotropyMap]||null),e.sheenColorMap!==void 0&&(this.sheenColorMap=t[e.sheenColorMap]||null),e.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;const t=e.clippingPlanes;let n=null;if(t!==null){const i=t.length;n=new Array(i);for(let r=0;r!==i;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}}class rf extends Ln{constructor(e){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new ge(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}let Bs;const Wr=new L,ks=new L,Vs=new L,Hs=new pe,Xr=new pe,af=new De,ja=new L,Yr=new L,Qa=new L,of=new pe,Lc=new pe,lf=new pe;class m0 extends Lt{constructor(e=new rf){if(super(),this.isSprite=!0,this.type="Sprite",Bs===void 0){Bs=new At;const t=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new sf(t,5);Bs.setIndex([0,1,2,0,2,3]),Bs.setAttribute("position",new Gr(n,3,0,!1)),Bs.setAttribute("uv",new Gr(n,2,3,!1))}this.geometry=Bs,this.material=e,this.center=new pe(.5,.5),this.count=1}intersectsFrustum(e){return e.intersectsSprite(this)}raycast(e,t){e.camera===null&&He('Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),ks.setFromMatrixScale(this.matrixWorld),af.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),Vs.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&ks.multiplyScalar(-Vs.z);const n=this.material.rotation;let i,r;n!==0&&(r=Math.cos(n),i=Math.sin(n));const a=this.center;eo(ja.set(-.5,-.5,0),Vs,a,ks,i,r),eo(Yr.set(.5,-.5,0),Vs,a,ks,i,r),eo(Qa.set(.5,.5,0),Vs,a,ks,i,r),of.set(0,0),Lc.set(1,0),lf.set(1,1);let o=e.ray.intersectTriangle(ja,Yr,Qa,!1,Wr);if(o===null&&(eo(Yr.set(-.5,.5,0),Vs,a,ks,i,r),Lc.set(0,1),o=e.ray.intersectTriangle(ja,Qa,Yr,!1,Wr),o===null))return;const l=e.ray.origin.distanceTo(Wr);l<e.near||l>e.far||t.push({distance:l,point:Wr.clone(),uv:Vn.getInterpolation(Wr,ja,Yr,Qa,of,Lc,lf,new pe),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}}function eo(s,e,t,n,i,r){Hs.subVectors(s,t).addScalar(.5).multiply(n),i!==void 0?(Xr.x=r*Hs.x-i*Hs.y,Xr.y=i*Hs.x+r*Hs.y):Xr.copy(Hs),s.copy(e),s.x+=Xr.x,s.y+=Xr.y,s.applyMatrix4(af)}const Ui=new L,Dc=new L,to=new L,no=new L;class Gs{constructor(e=new L,t=new L(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Ui)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);const n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){const t=Ui.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Ui.copy(this.origin).addScaledVector(this.direction,t),Ui.distanceToSquared(e))}distanceSqToSegment(e,t,n,i){Dc.copy(e).add(t).multiplyScalar(.5),to.copy(t).sub(e).normalize(),no.copy(this.origin).sub(Dc);const r=e.distanceTo(t)*.5,a=-this.direction.dot(to),o=no.dot(this.direction),l=-no.dot(to),c=no.lengthSq(),h=Math.abs(1-a*a);let d,u,f,m;if(h>0)if(d=a*l-o,u=a*o-l,m=r*h,d>=0)if(u>=-m)if(u<=m){const _=1/h;d*=_,u*=_,f=d*(d+a*u+2*o)+u*(a*d+u+2*l)+c}else u=r,d=Math.max(0,-(a*u+o)),f=-d*d+u*(u+2*l)+c;else u=-r,d=Math.max(0,-(a*u+o)),f=-d*d+u*(u+2*l)+c;else u<=-m?(d=Math.max(0,-(-a*r+o)),u=d>0?-r:Math.min(Math.max(-r,-l),r),f=-d*d+u*(u+2*l)+c):u<=m?(d=0,u=Math.min(Math.max(-r,-l),r),f=u*(u+2*l)+c):(d=Math.max(0,-(a*r+o)),u=d>0?r:Math.min(Math.max(-r,-l),r),f=-d*d+u*(u+2*l)+c);else u=a>0?-r:r,d=Math.max(0,-(a*u+o)),f=-d*d+u*(u+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,d),i&&i.copy(Dc).addScaledVector(to,u),f}intersectSphere(e,t){if(e.radius<0)return null;Ui.subVectors(e.center,this.origin);const n=Ui.dot(this.direction),i=Ui.dot(Ui)-n*n,r=e.radius*e.radius;if(i>r)return null;const a=Math.sqrt(r-i),o=n-a,l=n+a;return l<0?null:o<0?this.at(l,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){const t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){const n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){const t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,i,r,a,o,l;const c=1/this.direction.x,h=1/this.direction.y,d=1/this.direction.z,u=this.origin;return c>=0?(n=(e.min.x-u.x)*c,i=(e.max.x-u.x)*c):(n=(e.max.x-u.x)*c,i=(e.min.x-u.x)*c),h>=0?(r=(e.min.y-u.y)*h,a=(e.max.y-u.y)*h):(r=(e.max.y-u.y)*h,a=(e.min.y-u.y)*h),n>a||r>i||((r>n||isNaN(n))&&(n=r),(a<i||isNaN(i))&&(i=a),d>=0?(o=(e.min.z-u.z)*d,l=(e.max.z-u.z)*d):(o=(e.max.z-u.z)*d,l=(e.min.z-u.z)*d),n>l||o>i)||((o>n||n!==n)&&(n=o),(l<i||i!==i)&&(i=l),i<0)?null:this.at(n>=0?n:i,t)}intersectsBox(e){return this.intersectBox(e,Ui)!==null}intersectTriangle(e,t,n,i,r){const a=this.origin,o=this.direction,l=o.x,c=o.y,h=o.z,d=e.x-a.x,u=e.y-a.y,f=e.z-a.z,m=t.x-a.x,_=t.y-a.y,p=t.z-a.z,g=n.x-a.x,v=n.y-a.y,M=n.z-a.z,x=Math.abs(l),w=Math.abs(c),S=Math.abs(h);let A,y,T,C,P,D,U,R,B,V,q,se;if(x>=w&&x>=S?(T=l,D=d,B=m,se=g,l>=0?(A=c,y=h,C=u,P=f,U=_,R=p,V=v,q=M):(A=h,y=c,C=f,P=u,U=p,R=_,V=M,q=v)):w>=S?(T=c,D=u,B=_,se=v,c>=0?(A=h,y=l,C=f,P=d,U=p,R=m,V=M,q=g):(A=l,y=h,C=d,P=f,U=m,R=p,V=g,q=M)):(T=h,D=f,B=p,se=M,h>=0?(A=l,y=c,C=d,P=u,U=m,R=_,V=g,q=v):(A=c,y=l,C=u,P=d,U=_,R=m,V=v,q=g)),T===0)return null;const $=A/T,ee=y/T,ue=1/T,ve=C-$*D,Me=P-ee*D,Xe=U-$*B,Oe=R-ee*B,Ue=V-$*se,re=q-ee*se,le=Ue*Oe-re*Xe,ye=ve*re-Me*Ue,Ne=Xe*Me-Oe*ve;if(i){if(le<0||ye<0||Ne<0)return null}else if((le<0||ye<0||Ne<0)&&(le>0||ye>0||Ne>0))return null;const we=le+ye+Ne;if(we===0)return null;const Ge=ue*(le*D+ye*B+Ne*se);return(we>0?Ge<0:Ge>0)?null:this.at(Ge/we,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class Dt extends Ln{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new ge(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new kn,this.combine=gl,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}const cf=new De,as=new Gs,io=new hi,hf=new L,so=new L,ro=new L,ao=new L,Uc=new L,oo=new L,uf=new L,lo=new L;class $e extends Lt{constructor(e=new At,t=new Dt){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){const o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(e,t){const n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(i,e);const o=this.morphTargetInfluences;if(r&&o){oo.set(0,0,0);for(let l=0,c=r.length;l<c;l++){const h=o[l],d=r[l];h!==0&&(Uc.fromBufferAttribute(d,e),a?oo.addScaledVector(Uc,h):oo.addScaledVector(Uc.sub(t),h))}t.add(oo)}return t}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){const n=this.geometry,i=this.material,r=this.matrixWorld;i!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),io.copy(n.boundingSphere),io.applyMatrix4(r),as.copy(e.ray).recast(e.near),!(io.containsPoint(as.origin)===!1&&(as.intersectSphere(io,hf)===null||as.origin.distanceToSquared(hf)>(e.far-e.near)**2))&&(cf.copy(r).invert(),as.copy(e.ray).applyMatrix4(cf),!(n.boundingBox!==null&&as.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,as)))}_computeIntersections(e,t,n){let i;const r=this.geometry,a=this.material,o=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,d=r.attributes.normal,u=r.groups,f=r.drawRange;if(o!==null)if(Array.isArray(a))for(let m=0,_=u.length;m<_;m++){const p=u[m],g=a[p.materialIndex],v=Math.max(p.start,f.start),M=Math.min(o.count,Math.min(p.start+p.count,f.start+f.count));for(let x=v,w=M;x<w;x+=3){const S=o.getX(x),A=o.getX(x+1),y=o.getX(x+2);i=co(this,g,e,n,c,h,d,S,A,y),i&&(i.faceIndex=Math.floor(x/3),i.face.materialIndex=p.materialIndex,t.push(i))}}else{const m=Math.max(0,f.start),_=Math.min(o.count,f.start+f.count);for(let p=m,g=_;p<g;p+=3){const v=o.getX(p),M=o.getX(p+1),x=o.getX(p+2);i=co(this,a,e,n,c,h,d,v,M,x),i&&(i.faceIndex=Math.floor(p/3),t.push(i))}}else if(l!==void 0)if(Array.isArray(a))for(let m=0,_=u.length;m<_;m++){const p=u[m],g=a[p.materialIndex],v=Math.max(p.start,f.start),M=Math.min(l.count,Math.min(p.start+p.count,f.start+f.count));for(let x=v,w=M;x<w;x+=3){const S=x,A=x+1,y=x+2;i=co(this,g,e,n,c,h,d,S,A,y),i&&(i.faceIndex=Math.floor(x/3),i.face.materialIndex=p.materialIndex,t.push(i))}}else{const m=Math.max(0,f.start),_=Math.min(l.count,f.start+f.count);for(let p=m,g=_;p<g;p+=3){const v=p,M=p+1,x=p+2;i=co(this,a,e,n,c,h,d,v,M,x),i&&(i.faceIndex=Math.floor(p/3),t.push(i))}}}}function g0(s,e,t,n,i,r,a,o){let l;if(e.side===xn?l=n.intersectTriangle(a,r,i,!0,o):l=n.intersectTriangle(i,r,a,e.side===ki,o),l===null)return null;lo.copy(o),lo.applyMatrix4(s.matrixWorld);const c=t.ray.origin.distanceTo(lo);return c<t.near||c>t.far?null:{distance:c,point:lo.clone(),object:s}}function co(s,e,t,n,i,r,a,o,l,c){s.getVertexPosition(o,so),s.getVertexPosition(l,ro),s.getVertexPosition(c,ao);const h=g0(s,e,t,n,so,ro,ao,uf);if(h){const d=new L;Vn.getBarycoord(uf,so,ro,ao,d),i&&(h.uv=Vn.getInterpolatedAttribute(i,o,l,c,d,new pe)),r&&(h.uv1=Vn.getInterpolatedAttribute(r,o,l,c,d,new pe)),a&&(h.normal=Vn.getInterpolatedAttribute(a,o,l,c,d,new L),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));const u={a:o,b:l,c,normal:new L,materialIndex:0};Vn.getNormal(so,ro,ao,u.normal),h.face=u,h.barycoord=d}return h}const qr=new Mt,ff=new Mt,df=new Mt,x0=new Mt,pf=new De,ho=new L,Nc=new hi,mf=new De,zc=new Gs;class v0 extends $e{constructor(e,t){super(e,t),this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode=wu,this.bindMatrix=new De,this.bindMatrixInverse=new De,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){const e=this.geometry;this.boundingBox===null&&(this.boundingBox=new Li),this.boundingBox.makeEmpty();const t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,ho),this.boundingBox.expandByPoint(ho)}computeBoundingSphere(){const e=this.geometry;this.boundingSphere===null&&(this.boundingSphere=new hi),this.boundingSphere.makeEmpty();const t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,ho),this.boundingSphere.expandByPoint(ho)}copy(e,t){return super.copy(e,t),this.bindMode=e.bindMode,this.bindMatrix.copy(e.bindMatrix),this.bindMatrixInverse.copy(e.bindMatrixInverse),this.skeleton=e.skeleton,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}raycast(e,t){const n=this.material,i=this.matrixWorld;n!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Nc.copy(this.boundingSphere),Nc.applyMatrix4(i),e.ray.intersectsSphere(Nc)!==!1&&(mf.copy(i).invert(),zc.copy(e.ray).applyMatrix4(mf),!(this.boundingBox!==null&&zc.intersectsBox(this.boundingBox)===!1)&&this._computeIntersections(e,t,zc)))}getVertexPosition(e,t){return super.getVertexPosition(e,t),this.applyBoneTransform(e,t),t}bind(e,t){this.skeleton=e,t===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),t=this.matrixWorld),this.bindMatrix.copy(t),this.bindMatrixInverse.copy(t).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){const e=new Mt,t=this.geometry.attributes.skinWeight;for(let n=0,i=t.count;n<i;n++){e.fromBufferAttribute(t,n);const r=1/e.manhattanLength();r!==1/0?e.multiplyScalar(r):e.set(1,0,0,0),t.setXYZW(n,e.x,e.y,e.z,e.w)}}updateMatrixWorld(e){super.updateMatrixWorld(e),this.bindMode===wu?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode===gm?this.bindMatrixInverse.copy(this.bindMatrix).invert():Fe("SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}applyBoneTransform(e,t){const n=this.skeleton,i=this.geometry;ff.fromBufferAttribute(i.attributes.skinIndex,e),df.fromBufferAttribute(i.attributes.skinWeight,e),t.isVector4?(qr.copy(t),t.set(0,0,0,0)):(qr.set(...t,1),t.set(0,0,0)),qr.applyMatrix4(this.bindMatrix);for(let r=0;r<4;r++){const a=df.getComponent(r);if(a!==0){const o=ff.getComponent(r);pf.multiplyMatrices(n.bones[o].matrixWorld,n.boneInverses[o]),t.addScaledVector(x0.copy(qr).applyMatrix4(pf),a)}}return t.isVector4&&(t.w=qr.w),t.applyMatrix4(this.bindMatrixInverse)}}class gf extends Lt{constructor(){super(),this.isBone=!0,this.type="Bone"}}class Ws extends Ft{constructor(e=null,t=1,n=1,i,r,a,o,l,c=Ht,h=Ht,d,u){super(null,a,o,l,c,h,i,r,d,u),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}const xf=new De,_0=new De;class Fc{constructor(e=[],t=[]){this.uuid=Bn(),this.bones=e.slice(0),this.boneInverses=t,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){const e=this.bones,t=this.boneInverses;if(this.boneMatrices=new Float32Array(e.length*16),t.length===0)this.calculateInverses();else if(e.length!==t.length){Fe("Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,i=this.bones.length;n<i;n++)this.boneInverses.push(new De)}}calculateInverses(){this.boneInverses.length=0;for(let e=0,t=this.bones.length;e<t;e++){const n=new De;this.bones[e]&&n.copy(this.bones[e].matrixWorld).invert(),this.boneInverses.push(n)}}pose(){for(let e=0,t=this.bones.length;e<t;e++){const n=this.bones[e];n&&n.matrixWorld.copy(this.boneInverses[e]).invert()}for(let e=0,t=this.bones.length;e<t;e++){const n=this.bones[e];n&&(n.parent&&n.parent.isBone?(n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld)):n.matrix.copy(n.matrixWorld),n.matrix.decompose(n.position,n.quaternion,n.scale))}}update(){const e=this.bones,t=this.boneInverses,n=this.boneMatrices,i=this.boneTexture;for(let r=0,a=e.length;r<a;r++){const o=e[r]?e[r].matrixWorld:_0;xf.multiplyMatrices(o,t[r]),xf.toArray(n,r*16)}i!==null&&(i.needsUpdate=!0)}clone(){return new Fc(this.bones,this.boneInverses)}computeBoneTexture(){let e=Math.sqrt(this.bones.length*4);e=Math.ceil(e/4)*4,e=Math.max(e,4);const t=new Float32Array(e*e*4);t.set(this.boneMatrices);const n=new Ws(t,e,e,Cn,On);return n.needsUpdate=!0,this.boneMatrices=t,this.boneTexture=n,this}getBoneByName(e){for(let t=0,n=this.bones.length;t<n;t++){const i=this.bones[t];if(i.name===e)return i}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null)}fromJSON(e,t){this.uuid=e.uuid;for(let n=0,i=e.bones.length;n<i;n++){const r=e.bones[n];let a=t[r];a===void 0&&(Fe("Skeleton: No bone found with UUID:",r),a=new gf),this.bones.push(a),this.boneInverses.push(new De().fromArray(e.boneInverses[n]))}return this.init(),this}toJSON(){const e={metadata:{version:4.7,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};e.uuid=this.uuid;const t=this.bones,n=this.boneInverses;for(let i=0,r=t.length;i<r;i++){const a=t[i];e.bones.push(a.uuid);const o=n[i];e.boneInverses.push(o.toArray())}return e}}class os extends Ot{constructor(e,t,n,i=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=i}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){const e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}}const Xs=new De,vf=new De,uo=[],_f=new Li,M0=new De,Zr=new $e,$r=new hi;class Vt extends $e{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new os(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let i=0;i<n;i++)this.setMatrixAt(i,M0)}computeBoundingBox(){const e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new Li),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Xs),_f.copy(e.boundingBox).applyMatrix4(Xs),this.boundingBox.union(_f)}computeBoundingSphere(){const e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new hi),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Xs),$r.copy(e.boundingSphere).applyMatrix4(Xs),this.boundingSphere.union($r)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){return this.instanceColor===null?t.setRGB(1,1,1):t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){return t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){const n=t.morphTargetInfluences,i=this.morphTexture.source.data.data,r=n.length+1,a=e*r+1;for(let o=0;o<n.length;o++)n[o]=i[a+o]}raycast(e,t){const n=this.matrixWorld,i=this.count;if(Zr.geometry=this.geometry,Zr.material=this.material,Zr.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),$r.copy(this.boundingSphere),$r.applyMatrix4(n),e.ray.intersectsSphere($r)!==!1))for(let r=0;r<i;r++){this.getMatrixAt(r,Xs),vf.multiplyMatrices(n,Xs),Zr.matrixWorld=vf,Zr.raycast(e,uo);for(let a=0,o=uo.length;a<o;a++){const l=uo[a];l.instanceId=r,l.object=this,t.push(l)}uo.length=0}}setColorAt(e,t){return this.instanceColor===null&&(this.instanceColor=new os(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3),this}setMatrixAt(e,t){return t.toArray(this.instanceMatrix.array,e*16),this}setMorphAt(e,t){const n=t.morphTargetInfluences,i=n.length+1;this.morphTexture===null&&(this.morphTexture=new Ws(new Float32Array(i*this.count),i,this.count,Na,On));const r=this.morphTexture.source.data.data;let a=0;for(let c=0;c<n.length;c++)a+=n[c];const o=this.geometry.morphTargetsRelative?1:1-a,l=i*e;return r[l]=o,r.set(n,l+1),this}updateMorphTargets(){}dispose(){super.dispose(),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}}const ls=new hi,y0=new pe(.5,.5),fo=new L;class Oc{constructor(e=new ui,t=new ui,n=new ui,i=new ui,r=new ui,a=new ui){this.planes=[e,t,n,i,r,a]}set(e,t,n,i,r,a){const o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(i),o[4].copy(r),o[5].copy(a),this}copy(e){const t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=ci,n=!1){const i=this.planes,r=e.elements,a=r[0],o=r[1],l=r[2],c=r[3],h=r[4],d=r[5],u=r[6],f=r[7],m=r[8],_=r[9],p=r[10],g=r[11],v=r[12],M=r[13],x=r[14],w=r[15];if(i[0].setComponents(c-a,f-h,g-m,w-v).normalize(),i[1].setComponents(c+a,f+h,g+m,w+v).normalize(),i[2].setComponents(c+o,f+d,g+_,w+M).normalize(),i[3].setComponents(c-o,f-d,g-_,w-M).normalize(),n)i[4].setComponents(l,u,p,x).normalize(),i[5].setComponents(c-l,f-u,g-p,w-x).normalize();else if(i[4].setComponents(c-l,f-u,g-p,w-x).normalize(),t===ci)i[5].setComponents(c+l,f+u,g+p,w+x).normalize();else if(t===Ur)i[5].setComponents(l,u,p,x).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),ls.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{const t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),ls.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(ls)}intersectsSprite(e){ls.center.set(0,0,0);const t=y0.distanceTo(e.center);return ls.radius=.7071067811865476+t,ls.applyMatrix4(e.matrixWorld),this.intersectsSphere(ls)}intersectsSphere(e){const t=this.planes,n=e.center,i=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(e){const t=this.planes;for(let n=0;n<6;n++){const i=t[n];if(fo.x=i.normal.x>0?e.max.x:e.min.x,fo.y=i.normal.y>0?e.max.y:e.min.y,fo.z=i.normal.z>0?e.max.z:e.min.z,i.distanceToPoint(fo)<0)return!1}return!0}containsPoint(e){const t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class Mf extends Ln{constructor(e){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new ge(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}}const po=new L,mo=new L,yf=new De,Kr=new Gs,go=new hi,Bc=new L,Sf=new L;class kc extends Lt{constructor(e=new At,t=new Mf){super(),this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){const e=this.geometry;if(e.index===null){const t=e.attributes.position,n=[0];for(let i=1,r=t.count;i<r;i++)po.fromBufferAttribute(t,i-1),mo.fromBufferAttribute(t,i),n[i]=n[i-1],n[i]+=po.distanceTo(mo);e.setAttribute("lineDistance",new je(n,1))}else Fe("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){const n=this.geometry,i=this.matrixWorld,r=e.params.Line.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),go.copy(n.boundingSphere),go.applyMatrix4(i),go.radius+=r,e.ray.intersectsSphere(go)===!1)return;yf.copy(i).invert(),Kr.copy(e.ray).applyMatrix4(yf);const o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=this.isLineSegments?2:1,h=n.index,u=n.attributes.position;if(h!==null){const f=Math.max(0,a.start),m=Math.min(h.count,a.start+a.count);for(let _=f,p=m-1;_<p;_+=c){const g=h.getX(_),v=h.getX(_+1),M=xo(this,e,Kr,l,g,v,_);M&&t.push(M)}if(this.isLineLoop){const _=h.getX(m-1),p=h.getX(f),g=xo(this,e,Kr,l,_,p,m-1);g&&t.push(g)}}else{const f=Math.max(0,a.start),m=Math.min(u.count,a.start+a.count);for(let _=f,p=m-1;_<p;_+=c){const g=xo(this,e,Kr,l,_,_+1,_);g&&t.push(g)}if(this.isLineLoop){const _=xo(this,e,Kr,l,m-1,f,m-1);_&&t.push(_)}}}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){const o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}}function xo(s,e,t,n,i,r,a){const o=s.geometry.attributes.position;if(po.fromBufferAttribute(o,i),mo.fromBufferAttribute(o,r),t.distanceSqToSegment(po,mo,Bc,Sf)>n)return;Bc.applyMatrix4(s.matrixWorld);const c=e.ray.origin.distanceTo(Bc);if(!(c<e.near||c>e.far))return{distance:c,point:Sf.clone().applyMatrix4(s.matrixWorld),index:a,face:null,faceIndex:null,barycoord:null,object:s}}const wf=new L,bf=new L;class S0 extends kc{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){const e=this.geometry;if(e.index===null){const t=e.attributes.position,n=[];for(let i=0,r=t.count;i<r;i+=2)wf.fromBufferAttribute(t,i),bf.fromBufferAttribute(t,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+wf.distanceTo(bf);e.setAttribute("lineDistance",new je(n,1))}else Fe("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}}class w0 extends kc{constructor(e,t){super(e,t),this.isLineLoop=!0,this.type="LineLoop"}}class Tf extends Ln{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new ge(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}const Af=new De,Vc=new Gs,vo=new hi,_o=new L;class Ef extends Lt{constructor(e=new At,t=new Tf){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){const n=this.geometry,i=this.matrixWorld,r=e.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),vo.copy(n.boundingSphere),vo.applyMatrix4(i),vo.radius+=r,e.ray.intersectsSphere(vo)===!1)return;Af.copy(i).invert(),Vc.copy(e.ray).applyMatrix4(Af);const o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=n.index,d=n.attributes.position;if(c!==null){const u=Math.max(0,a.start),f=Math.min(c.count,a.start+a.count);for(let m=u,_=f;m<_;m++){const p=c.getX(m);_o.fromBufferAttribute(d,p),Cf(_o,p,l,i,e,t,this)}}else{const u=Math.max(0,a.start),f=Math.min(d.count,a.start+a.count);for(let m=u,_=f;m<_;m++)_o.fromBufferAttribute(d,m),Cf(_o,m,l,i,e,t,this)}}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){const o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}}function Cf(s,e,t,n,i,r,a){const o=Vc.distanceSqToPoint(s);if(o<t){const l=new L;Vc.closestPointToPoint(s,l),l.applyMatrix4(n);const c=i.ray.origin.distanceTo(l);if(c<i.near||c>i.far)return;r.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:e,face:null,faceIndex:null,barycoord:null,object:a})}}class Rf extends Ft{constructor(e=[],t=ns,n,i,r,a,o,l,c,h){super(e,t,n,i,r,a,o,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class Hc extends Ft{constructor(e,t,n,i,r,a,o,l,c){super(e,t,n,i,r,a,o,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}}class Ys extends Ft{constructor(e,t,n=li,i,r,a,o=Ht,l=Ht,c,h=Ai,d=1){if(h!==Ai&&h!==Vi)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const u={width:e,height:t,depth:d};super(u,i,r,a,o,l,h,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new pc(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){const t=super.toJSON(e);return t.compareFunction=this.compareFunction,t}}class b0 extends Ys{constructor(e,t=li,n=ns,i,r,a=Ht,o=Ht,l,c=Ai){const h={width:e,height:e,depth:1},d=[h,h,h,h,h,h];super(e,e,t,n,i,r,a,o,l,c),this.image=d,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}}class Pf extends Ft{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}}class mt extends At{constructor(e=1,t=1,n=1,i=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:i,heightSegments:r,depthSegments:a};const o=this;i=Math.floor(i),r=Math.floor(r),a=Math.floor(a);const l=[],c=[],h=[],d=[];let u=0,f=0;m("z","y","x",-1,-1,n,t,e,a,r,0),m("z","y","x",1,-1,n,t,-e,a,r,1),m("x","z","y",1,1,e,n,t,i,a,2),m("x","z","y",1,-1,e,n,-t,i,a,3),m("x","y","z",1,-1,e,t,n,i,r,4),m("x","y","z",-1,-1,e,t,-n,i,r,5),this.setIndex(l),this.setAttribute("position",new je(c,3)),this.setAttribute("normal",new je(h,3)),this.setAttribute("uv",new je(d,2));function m(_,p,g,v,M,x,w,S,A,y,T){const C=x/A,P=w/y,D=x/2,U=w/2,R=S/2,B=A+1,V=y+1;let q=0,se=0;const $=new L;for(let ee=0;ee<V;ee++){const ue=ee*P-U;for(let ve=0;ve<B;ve++){const Me=ve*C-D;$[_]=Me*v,$[p]=ue*M,$[g]=R,c.push($.x,$.y,$.z),$[_]=0,$[p]=0,$[g]=S>0?1:-1,h.push($.x,$.y,$.z),d.push(ve/A),d.push(1-ee/y),q+=1}}for(let ee=0;ee<y;ee++)for(let ue=0;ue<A;ue++){const ve=u+ue+B*ee,Me=u+ue+B*(ee+1),Xe=u+(ue+1)+B*(ee+1),Oe=u+(ue+1)+B*ee;l.push(ve,Me,Oe),l.push(Me,Xe,Oe),se+=6}o.addGroup(f,se,T),f+=se,u+=q}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new mt(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}class Jr extends At{constructor(e=1,t=32,n=0,i=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:e,segments:t,thetaStart:n,thetaLength:i},t=Math.max(3,t);const r=[],a=[],o=[],l=[],c=new L,h=new pe;a.push(0,0,0),o.push(0,0,1),l.push(.5,.5);for(let d=0,u=3;d<=t;d++,u+=3){const f=n+d/t*i;c.x=e*Math.cos(f),c.y=e*Math.sin(f),a.push(c.x,c.y,c.z),o.push(0,0,1),h.x=(a[u]/e+1)/2,h.y=(a[u+1]/e+1)/2,l.push(h.x,h.y)}for(let d=1;d<=t;d++)r.push(d,d+1,0);this.setIndex(r),this.setAttribute("position",new je(a,3)),this.setAttribute("normal",new je(o,3)),this.setAttribute("uv",new je(l,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Jr(e.radius,e.segments,e.thetaStart,e.thetaLength)}}class fn extends At{constructor(e=1,t=1,n=1,i=32,r=1,a=!1,o=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:i,heightSegments:r,openEnded:a,thetaStart:o,thetaLength:l};const c=this;i=Math.floor(i),r=Math.floor(r);const h=[],d=[],u=[],f=[];let m=0;const _=[],p=n/2;let g=0;v(),a===!1&&(e>0&&M(!0),t>0&&M(!1)),this.setIndex(h),this.setAttribute("position",new je(d,3)),this.setAttribute("normal",new je(u,3)),this.setAttribute("uv",new je(f,2));function v(){const x=new L,w=new L;let S=0;const A=(t-e)/n;for(let y=0;y<=r;y++){const T=[],C=y/r,P=C*(t-e)+e;for(let D=0;D<=i;D++){const U=D/i,R=U*l+o,B=Math.sin(R),V=Math.cos(R);w.x=P*B,w.y=-C*n+p,w.z=P*V,d.push(w.x,w.y,w.z),x.set(B,A,V).normalize(),u.push(x.x,x.y,x.z),f.push(U,1-C),T.push(m++)}_.push(T)}for(let y=0;y<i;y++)for(let T=0;T<r;T++){const C=_[T][y],P=_[T+1][y],D=_[T+1][y+1],U=_[T][y+1];(e>0||T!==0)&&(h.push(C,P,U),S+=3),(t>0||T!==r-1)&&(h.push(P,D,U),S+=3)}c.addGroup(g,S,0),g+=S}function M(x){const w=m,S=new pe,A=new L;let y=0;const T=x===!0?e:t,C=x===!0?1:-1;for(let D=1;D<=i;D++)d.push(0,p*C,0),u.push(0,C,0),f.push(.5,.5),m++;const P=m;for(let D=0;D<=i;D++){const R=D/i*l+o,B=Math.cos(R),V=Math.sin(R);A.x=T*V,A.y=p*C,A.z=T*B,d.push(A.x,A.y,A.z),u.push(0,C,0),S.x=B*.5+.5,S.y=V*.5*C+.5,f.push(S.x,S.y),m++}for(let D=0;D<i;D++){const U=w+D,R=P+D;x===!0?h.push(R,R+1,U):h.push(R+1,R,U),y+=3}c.addGroup(g,y,x===!0?1:2),g+=y}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new fn(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}}class Gn extends fn{constructor(e=1,t=1,n=32,i=1,r=!1,a=0,o=Math.PI*2){super(0,e,t,n,i,r,a,o),this.type="ConeGeometry",this.parameters={radius:e,height:t,radialSegments:n,heightSegments:i,openEnded:r,thetaStart:a,thetaLength:o}}static fromJSON(e){return new Gn(e.radius,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}}class jr extends At{constructor(e=[],t=[],n=1,i=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:e,indices:t,radius:n,detail:i};const r=[],a=[];o(i),c(n),h(),this.setAttribute("position",new je(r,3)),this.setAttribute("normal",new je(r.slice(),3)),this.setAttribute("uv",new je(a,2)),i===0?this.computeVertexNormals():this.normalizeNormals();function o(v){const M=new L,x=new L,w=new L;for(let S=0;S<t.length;S+=3)f(t[S+0],M),f(t[S+1],x),f(t[S+2],w),l(M,x,w,v)}function l(v,M,x,w){const S=w+1,A=[];for(let y=0;y<=S;y++){A[y]=[];const T=v.clone().lerp(x,y/S),C=M.clone().lerp(x,y/S),P=S-y;for(let D=0;D<=P;D++)D===0&&y===S?A[y][D]=T:A[y][D]=T.clone().lerp(C,D/P)}for(let y=0;y<S;y++)for(let T=0;T<2*(S-y)-1;T++){const C=Math.floor(T/2);T%2===0?(u(A[y][C+1]),u(A[y+1][C]),u(A[y][C])):(u(A[y][C+1]),u(A[y+1][C+1]),u(A[y+1][C]))}}function c(v){const M=new L;for(let x=0;x<r.length;x+=3)M.x=r[x+0],M.y=r[x+1],M.z=r[x+2],M.normalize().multiplyScalar(v),r[x+0]=M.x,r[x+1]=M.y,r[x+2]=M.z}function h(){const v=new L;for(let M=0;M<r.length;M+=3){v.x=r[M+0],v.y=r[M+1],v.z=r[M+2];const x=p(v)/2/Math.PI+.5,w=g(v)/Math.PI+.5;a.push(x,1-w)}m(),d()}function d(){for(let v=0;v<a.length;v+=6){const M=a[v+0],x=a[v+2],w=a[v+4],S=Math.max(M,x,w),A=Math.min(M,x,w);S>.9&&A<.1&&(M<.2&&(a[v+0]+=1),x<.2&&(a[v+2]+=1),w<.2&&(a[v+4]+=1))}}function u(v){r.push(v.x,v.y,v.z)}function f(v,M){const x=v*3;M.x=e[x+0],M.y=e[x+1],M.z=e[x+2]}function m(){const v=new L,M=new L,x=new L,w=new L,S=new pe,A=new pe,y=new pe;for(let T=0,C=0;T<r.length;T+=9,C+=6){v.set(r[T+0],r[T+1],r[T+2]),M.set(r[T+3],r[T+4],r[T+5]),x.set(r[T+6],r[T+7],r[T+8]),S.set(a[C+0],a[C+1]),A.set(a[C+2],a[C+3]),y.set(a[C+4],a[C+5]),w.copy(v).add(M).add(x).divideScalar(3);const P=p(w);_(S,C+0,v,P),_(A,C+2,M,P),_(y,C+4,x,P)}}function _(v,M,x,w){w<0&&v.x===1&&(a[M]=v.x-1),x.x===0&&x.z===0&&(a[M]=w/2/Math.PI+.5)}function p(v){return Math.atan2(v.z,-v.x)}function g(v){return Math.atan2(-v.y,Math.sqrt(v.x*v.x+v.z*v.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new jr(e.vertices,e.indices,e.radius,e.detail)}}class Mo extends jr{constructor(e=1,t=0){const n=(1+Math.sqrt(5))/2,i=1/n,r=[-1,-1,-1,-1,-1,1,-1,1,-1,-1,1,1,1,-1,-1,1,-1,1,1,1,-1,1,1,1,0,-i,-n,0,-i,n,0,i,-n,0,i,n,-i,-n,0,-i,n,0,i,-n,0,i,n,0,-n,0,-i,n,0,-i,-n,0,i,n,0,i],a=[3,11,7,3,7,15,3,15,13,7,19,17,7,17,6,7,6,15,17,4,8,17,8,10,17,10,6,8,0,16,8,16,2,8,2,10,0,12,1,0,1,18,0,18,16,6,10,2,6,2,13,6,13,15,2,16,18,2,18,3,2,3,13,18,1,9,18,9,11,18,11,3,4,14,12,4,12,0,4,0,8,11,9,5,11,5,19,11,19,7,19,5,14,19,14,4,19,4,17,1,12,14,1,14,5,1,5,9];super(r,a,e,t),this.type="DodecahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new Mo(e.radius,e.detail)}}class fi{constructor(){this.type="Curve",this.arcLengthDivisions=200,this.needsUpdate=!1,this.cacheArcLengths=null}getPoint(){Fe("Curve: .getPoint() not implemented.")}getPointAt(e,t){const n=this.getUtoTmapping(e);return this.getPoint(n,t)}getPoints(e=5){const t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return t}getSpacedPoints(e=5){const t=[];for(let n=0;n<=e;n++)t.push(this.getPointAt(n/e));return t}getLength(){const e=this.getLengths();return e[e.length-1]}getLengths(e=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===e+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;const t=[];let n,i=this.getPoint(0),r=0;t.push(0);for(let a=1;a<=e;a++)n=this.getPoint(a/e),r+=n.distanceTo(i),t.push(r),i=n;return this.cacheArcLengths=t,t}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(e,t=null){const n=this.getLengths();let i=0;const r=n.length;let a;t?a=t:a=e*n[r-1];let o=0,l=r-1,c;for(;o<=l;)if(i=Math.floor(o+(l-o)/2),c=n[i]-a,c<0)o=i+1;else if(c>0)l=i-1;else{l=i;break}if(i=l,n[i]===a)return i/(r-1);const h=n[i],u=n[i+1]-h,f=(a-h)/u;return(i+f)/(r-1)}getTangent(e,t){let i=e-1e-4,r=e+1e-4;i<0&&(i=0),r>1&&(r=1);const a=this.getPoint(i),o=this.getPoint(r),l=t||(a.isVector2?new pe:new L);return l.copy(o).sub(a).normalize(),l}getTangentAt(e,t){const n=this.getUtoTmapping(e);return this.getTangent(n,t)}computeFrenetFrames(e,t=!1){const n=new L,i=[],r=[],a=[],o=new L,l=new De;for(let f=0;f<=e;f++){const m=f/e;i[f]=this.getTangentAt(m,new L)}r[0]=new L,a[0]=new L;let c=Number.MAX_VALUE;const h=Math.abs(i[0].x),d=Math.abs(i[0].y),u=Math.abs(i[0].z);h<=c&&(c=h,n.set(1,0,0)),d<=c&&(c=d,n.set(0,1,0)),u<=c&&n.set(0,0,1),o.crossVectors(i[0],n).normalize(),r[0].crossVectors(i[0],o),a[0].crossVectors(i[0],r[0]);for(let f=1;f<=e;f++){if(r[f]=r[f-1].clone(),a[f]=a[f-1].clone(),o.crossVectors(i[f-1],i[f]),o.length()>Number.EPSILON){o.normalize();const m=Math.acos(Je(i[f-1].dot(i[f]),-1,1));r[f].applyMatrix4(l.makeRotationAxis(o,m))}a[f].crossVectors(i[f],r[f])}if(t===!0){let f=Math.acos(Je(r[0].dot(r[e]),-1,1));f/=e,i[0].dot(o.crossVectors(r[0],r[e]))>0&&(f=-f);for(let m=1;m<=e;m++)r[m].applyMatrix4(l.makeRotationAxis(i[m],f*m)),a[m].crossVectors(i[m],r[m])}return{tangents:i,normals:r,binormals:a}}clone(){return new this.constructor().copy(this)}copy(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}toJSON(){const e={metadata:{version:4.7,type:"Curve",generator:"Curve.toJSON"}};return e.arcLengthDivisions=this.arcLengthDivisions,e.type=this.type,e}fromJSON(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}}class Gc extends fi{constructor(e=0,t=0,n=1,i=1,r=0,a=Math.PI*2,o=!1,l=0){super(),this.isEllipseCurve=!0,this.type="EllipseCurve",this.aX=e,this.aY=t,this.xRadius=n,this.yRadius=i,this.aStartAngle=r,this.aEndAngle=a,this.aClockwise=o,this.aRotation=l}getPoint(e,t=new pe){const n=t,i=Math.PI*2;let r=this.aEndAngle-this.aStartAngle;const a=Math.abs(r)<Number.EPSILON;for(;r<0;)r+=i;for(;r>i;)r-=i;r<Number.EPSILON&&(a?r=0:r=i),this.aClockwise===!0&&!a&&(r===i?r=-i:r=r-i);const o=this.aStartAngle+e*r;let l=this.aX+this.xRadius*Math.cos(o),c=this.aY+this.yRadius*Math.sin(o);if(this.aRotation!==0){const h=Math.cos(this.aRotation),d=Math.sin(this.aRotation),u=l-this.aX,f=c-this.aY;l=u*h-f*d+this.aX,c=u*d+f*h+this.aY}return n.set(l,c)}copy(e){return super.copy(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}toJSON(){const e=super.toJSON();return e.aX=this.aX,e.aY=this.aY,e.xRadius=this.xRadius,e.yRadius=this.yRadius,e.aStartAngle=this.aStartAngle,e.aEndAngle=this.aEndAngle,e.aClockwise=this.aClockwise,e.aRotation=this.aRotation,e}fromJSON(e){return super.fromJSON(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}}class T0 extends Gc{constructor(e,t,n,i,r,a){super(e,t,n,n,i,r,a),this.isArcCurve=!0,this.type="ArcCurve"}}function Wc(){let s=0,e=0,t=0,n=0;function i(r,a,o,l){s=r,e=o,t=-3*r+3*a-2*o-l,n=2*r-2*a+o+l}return{initCatmullRom:function(r,a,o,l,c){i(a,o,c*(o-r),c*(l-a))},initNonuniformCatmullRom:function(r,a,o,l,c,h,d){let u=(a-r)/c-(o-r)/(c+h)+(o-a)/h,f=(o-a)/h-(l-a)/(h+d)+(l-o)/d;u*=h,f*=h,i(a,o,u,f)},calc:function(r){const a=r*r,o=a*r;return s+e*r+t*a+n*o}}}const If=new L,Lf=new L,Xc=new Wc,Yc=new Wc,qc=new Wc;class yo extends fi{constructor(e=[],t=!1,n="centripetal",i=.5){super(),this.isCatmullRomCurve3=!0,this.type="CatmullRomCurve3",this.points=e,this.closed=t,this.curveType=n,this.tension=i}getPoint(e,t=new L){const n=t,i=this.points,r=i.length,a=(r-(this.closed?0:1))*e;let o=Math.floor(a),l=a-o;this.closed?o+=o>0?0:(Math.floor(Math.abs(o)/r)+1)*r:l===0&&o===r-1&&(o=r-2,l=1);let c,h;this.closed||o>0?c=i[(o-1)%r]:(Lf.subVectors(i[0],i[1]).add(i[0]),c=Lf);const d=i[o%r],u=i[(o+1)%r];if(this.closed||o+2<r?h=i[(o+2)%r]:(If.subVectors(i[r-1],i[r-2]).add(i[r-1]),h=If),this.curveType==="centripetal"||this.curveType==="chordal"){const f=this.curveType==="chordal"?.5:.25;let m=Math.pow(c.distanceToSquared(d),f),_=Math.pow(d.distanceToSquared(u),f),p=Math.pow(u.distanceToSquared(h),f);_<1e-4&&(_=1),m<1e-4&&(m=_),p<1e-4&&(p=_),Xc.initNonuniformCatmullRom(c.x,d.x,u.x,h.x,m,_,p),Yc.initNonuniformCatmullRom(c.y,d.y,u.y,h.y,m,_,p),qc.initNonuniformCatmullRom(c.z,d.z,u.z,h.z,m,_,p)}else this.curveType==="catmullrom"&&(Xc.initCatmullRom(c.x,d.x,u.x,h.x,this.tension),Yc.initCatmullRom(c.y,d.y,u.y,h.y,this.tension),qc.initCatmullRom(c.z,d.z,u.z,h.z,this.tension));return n.set(Xc.calc(l),Yc.calc(l),qc.calc(l)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){const i=e.points[t];this.points.push(i.clone())}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}toJSON(){const e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){const i=this.points[t];e.points.push(i.toArray())}return e.closed=this.closed,e.curveType=this.curveType,e.tension=this.tension,e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){const i=e.points[t];this.points.push(new L().fromArray(i))}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}}function Df(s,e,t,n,i){const r=(n-e)*.5,a=(i-t)*.5,o=s*s,l=s*o;return(2*t-2*n+r+a)*l+(-3*t+3*n-2*r-a)*o+r*s+t}function A0(s,e){const t=1-s;return t*t*e}function E0(s,e){return 2*(1-s)*s*e}function C0(s,e){return s*s*e}function Qr(s,e,t,n){return A0(s,e)+E0(s,t)+C0(s,n)}function R0(s,e){const t=1-s;return t*t*t*e}function P0(s,e){const t=1-s;return 3*t*t*s*e}function I0(s,e){return 3*(1-s)*s*s*e}function L0(s,e){return s*s*s*e}function ea(s,e,t,n,i){return R0(s,e)+P0(s,t)+I0(s,n)+L0(s,i)}class Uf extends fi{constructor(e=new pe,t=new pe,n=new pe,i=new pe){super(),this.isCubicBezierCurve=!0,this.type="CubicBezierCurve",this.v0=e,this.v1=t,this.v2=n,this.v3=i}getPoint(e,t=new pe){const n=t,i=this.v0,r=this.v1,a=this.v2,o=this.v3;return n.set(ea(e,i.x,r.x,a.x,o.x),ea(e,i.y,r.y,a.y,o.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){const e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}}class D0 extends fi{constructor(e=new L,t=new L,n=new L,i=new L){super(),this.isCubicBezierCurve3=!0,this.type="CubicBezierCurve3",this.v0=e,this.v1=t,this.v2=n,this.v3=i}getPoint(e,t=new L){const n=t,i=this.v0,r=this.v1,a=this.v2,o=this.v3;return n.set(ea(e,i.x,r.x,a.x,o.x),ea(e,i.y,r.y,a.y,o.y),ea(e,i.z,r.z,a.z,o.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){const e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}}class Nf extends fi{constructor(e=new pe,t=new pe){super(),this.isLineCurve=!0,this.type="LineCurve",this.v1=e,this.v2=t}getPoint(e,t=new pe){const n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new pe){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){const e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}}class U0 extends fi{constructor(e=new L,t=new L){super(),this.isLineCurve3=!0,this.type="LineCurve3",this.v1=e,this.v2=t}getPoint(e,t=new L){const n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new L){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){const e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}}class zf extends fi{constructor(e=new pe,t=new pe,n=new pe){super(),this.isQuadraticBezierCurve=!0,this.type="QuadraticBezierCurve",this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new pe){const n=t,i=this.v0,r=this.v1,a=this.v2;return n.set(Qr(e,i.x,r.x,a.x),Qr(e,i.y,r.y,a.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){const e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}}class Ff extends fi{constructor(e=new L,t=new L,n=new L){super(),this.isQuadraticBezierCurve3=!0,this.type="QuadraticBezierCurve3",this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new L){const n=t,i=this.v0,r=this.v1,a=this.v2;return n.set(Qr(e,i.x,r.x,a.x),Qr(e,i.y,r.y,a.y),Qr(e,i.z,r.z,a.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){const e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}}class Of extends fi{constructor(e=[]){super(),this.isSplineCurve=!0,this.type="SplineCurve",this.points=e}getPoint(e,t=new pe){const n=t,i=this.points,r=(i.length-1)*e,a=Math.floor(r),o=r-a,l=i[a===0?a:a-1],c=i[a],h=i[a>i.length-2?i.length-1:a+1],d=i[a>i.length-3?i.length-1:a+2];return n.set(Df(o,l.x,c.x,h.x,d.x),Df(o,l.y,c.y,h.y,d.y)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){const i=e.points[t];this.points.push(i.clone())}return this}toJSON(){const e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){const i=this.points[t];e.points.push(i.toArray())}return e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){const i=e.points[t];this.points.push(new pe().fromArray(i))}return this}}var Zc=Object.freeze({__proto__:null,ArcCurve:T0,CatmullRomCurve3:yo,CubicBezierCurve:Uf,CubicBezierCurve3:D0,EllipseCurve:Gc,LineCurve:Nf,LineCurve3:U0,QuadraticBezierCurve:zf,QuadraticBezierCurve3:Ff,SplineCurve:Of});class N0 extends fi{constructor(){super(),this.type="CurvePath",this.curves=[],this.autoClose=!1}add(e){this.curves.push(e)}closePath(){const e=this.curves[0].getPoint(0),t=this.curves[this.curves.length-1].getPoint(1);if(!e.equals(t)){const n=e.isVector2===!0?"LineCurve":"LineCurve3";this.curves.push(new Zc[n](t,e))}return this}getPoint(e,t){const n=e*this.getLength(),i=this.getCurveLengths();let r=0;for(;r<i.length;){if(i[r]>=n){const a=i[r]-n,o=this.curves[r],l=o.getLength(),c=l===0?0:1-a/l;return o.getPointAt(c,t)}r++}return null}getLength(){const e=this.getCurveLengths();return e[e.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;const e=[];let t=0;for(let n=0,i=this.curves.length;n<i;n++)t+=this.curves[n].getLength(),e.push(t);return this.cacheLengths=e,e}getSpacedPoints(e=40){const t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return this.autoClose&&t.push(t[0]),t}getPoints(e=12){const t=[];let n;for(let i=0,r=this.curves;i<r.length;i++){const a=r[i],o=a.isEllipseCurve?e*2:a.isLineCurve||a.isLineCurve3?1:a.isSplineCurve?e*a.points.length:e,l=a.getPoints(o);for(let c=0;c<l.length;c++){const h=l[c];n&&n.equals(h)||(t.push(h),n=h)}}return this.autoClose&&t.length>1&&!t[t.length-1].equals(t[0])&&t.push(t[0]),t}copy(e){super.copy(e),this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){const i=e.curves[t];this.curves.push(i.clone())}return this.autoClose=e.autoClose,this}toJSON(){const e=super.toJSON();e.autoClose=this.autoClose,e.curves=[];for(let t=0,n=this.curves.length;t<n;t++){const i=this.curves[t];e.curves.push(i.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.autoClose=e.autoClose,this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){const i=e.curves[t];this.curves.push(new Zc[i.type]().fromJSON(i))}return this}}class Bf extends N0{constructor(e){super(),this.type="Path",this.currentPoint=new pe,e&&this.setFromPoints(e)}setFromPoints(e){this.moveTo(e[0].x,e[0].y);for(let t=1,n=e.length;t<n;t++)this.lineTo(e[t].x,e[t].y);return this}moveTo(e,t){return this.currentPoint.set(e,t),this}lineTo(e,t){const n=new Nf(this.currentPoint.clone(),new pe(e,t));return this.curves.push(n),this.currentPoint.set(e,t),this}quadraticCurveTo(e,t,n,i){const r=new zf(this.currentPoint.clone(),new pe(e,t),new pe(n,i));return this.curves.push(r),this.currentPoint.set(n,i),this}bezierCurveTo(e,t,n,i,r,a){const o=new Uf(this.currentPoint.clone(),new pe(e,t),new pe(n,i),new pe(r,a));return this.curves.push(o),this.currentPoint.set(r,a),this}splineThru(e){const t=[this.currentPoint.clone()].concat(e),n=new Of(t);return this.curves.push(n),this.currentPoint.copy(e[e.length-1]),this}arc(e,t,n,i,r,a){const o=this.currentPoint.x,l=this.currentPoint.y;return this.absarc(e+o,t+l,n,i,r,a),this}absarc(e,t,n,i,r,a){return this.absellipse(e,t,n,n,i,r,a),this}ellipse(e,t,n,i,r,a,o,l){const c=this.currentPoint.x,h=this.currentPoint.y;return this.absellipse(e+c,t+h,n,i,r,a,o,l),this}absellipse(e,t,n,i,r,a,o,l){const c=new Gc(e,t,n,i,r,a,o,l);if(this.curves.length>0){const d=c.getPoint(0);d.equals(this.currentPoint)||this.lineTo(d.x,d.y)}this.curves.push(c);const h=c.getPoint(1);return this.currentPoint.copy(h),this}copy(e){return super.copy(e),this.currentPoint.copy(e.currentPoint),this}toJSON(){const e=super.toJSON();return e.currentPoint=this.currentPoint.toArray(),e}fromJSON(e){return super.fromJSON(e),this.currentPoint.fromArray(e.currentPoint),this}}class kf extends Bf{constructor(e){super(e),this.uuid=Bn(),this.type="Shape",this.holes=[]}getPointsHoles(e){const t=[];for(let n=0,i=this.holes.length;n<i;n++)t[n]=this.holes[n].getPoints(e);return t}extractPoints(e){return{shape:this.getPoints(e),holes:this.getPointsHoles(e)}}copy(e){super.copy(e),this.holes=[];for(let t=0,n=e.holes.length;t<n;t++){const i=e.holes[t];this.holes.push(i.clone())}return this}toJSON(){const e=super.toJSON();e.uuid=this.uuid,e.holes=[];for(let t=0,n=this.holes.length;t<n;t++){const i=this.holes[t];e.holes.push(i.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.uuid=e.uuid,this.holes=[];for(let t=0,n=e.holes.length;t<n;t++){const i=e.holes[t];this.holes.push(new Bf().fromJSON(i))}return this}}function z0(s,e,t=2){const n=e&&e.length,i=n?e[0]*t:s.length;let r=Vf(s,0,i,t,!0);const a=[];if(!r||r.next===r.prev)return a;let o,l,c;if(n&&(r=V0(s,e,r,t)),s.length>80*t){o=s[0],l=s[1];let h=o,d=l;for(let u=t;u<i;u+=t){const f=s[u],m=s[u+1];f<o&&(o=f),m<l&&(l=m),f>h&&(h=f),m>d&&(d=m)}c=Math.max(h-o,d-l),c=c!==0?32767/c:0}return ta(r,a,t,o,l,c,0),a}function Vf(s,e,t,n,i){let r;if(i===j0(s,e,t,n)>0)for(let a=e;a<t;a+=n)r=Xf(a/n|0,s[a],s[a+1],r);else for(let a=t-n;a>=e;a-=n)r=Xf(a/n|0,s[a],s[a+1],r);return r&&qs(r,r.next)&&(sa(r),r=r.next),r}function cs(s,e){if(!s)return s;e||(e=s);let t=s,n;do if(n=!1,!t.steiner&&(qs(t,t.next)||Bt(t.prev,t,t.next)===0)){if(sa(t),t=e=t.prev,t===t.next)break;n=!0}else t=t.next;while(n||t!==e);return e}function ta(s,e,t,n,i,r,a){if(!s)return;!a&&r&&Y0(s,n,i,r);let o=s;for(;s.prev!==s.next;){const l=s.prev,c=s.next;if(r?O0(s,n,i,r):F0(s)){e.push(l.i,s.i,c.i),sa(s),s=c.next,o=c.next;continue}if(s=c,s===o){a?a===1?(s=B0(cs(s),e),ta(s,e,t,n,i,r,2)):a===2&&k0(s,e,t,n,i,r):ta(cs(s),e,t,n,i,r,1);break}}}function F0(s){const e=s.prev,t=s,n=s.next;if(Bt(e,t,n)>=0)return!1;const i=e.x,r=t.x,a=n.x,o=e.y,l=t.y,c=n.y,h=Math.min(i,r,a),d=Math.min(o,l,c),u=Math.max(i,r,a),f=Math.max(o,l,c);let m=n.next;for(;m!==e;){if(m.x>=h&&m.x<=u&&m.y>=d&&m.y<=f&&na(i,o,r,l,a,c,m.x,m.y)&&Bt(m.prev,m,m.next)>=0)return!1;m=m.next}return!0}function O0(s,e,t,n){const i=s.prev,r=s,a=s.next;if(Bt(i,r,a)>=0)return!1;const o=i.x,l=r.x,c=a.x,h=i.y,d=r.y,u=a.y,f=Math.min(o,l,c),m=Math.min(h,d,u),_=Math.max(o,l,c),p=Math.max(h,d,u),g=$c(f,m,e,t,n),v=$c(_,p,e,t,n);let M=s.prevZ,x=s.nextZ;for(;M&&M.z>=g&&x&&x.z<=v;){if(M.x>=f&&M.x<=_&&M.y>=m&&M.y<=p&&M!==i&&M!==a&&na(o,h,l,d,c,u,M.x,M.y)&&Bt(M.prev,M,M.next)>=0||(M=M.prevZ,x.x>=f&&x.x<=_&&x.y>=m&&x.y<=p&&x!==i&&x!==a&&na(o,h,l,d,c,u,x.x,x.y)&&Bt(x.prev,x,x.next)>=0))return!1;x=x.nextZ}for(;M&&M.z>=g;){if(M.x>=f&&M.x<=_&&M.y>=m&&M.y<=p&&M!==i&&M!==a&&na(o,h,l,d,c,u,M.x,M.y)&&Bt(M.prev,M,M.next)>=0)return!1;M=M.prevZ}for(;x&&x.z<=v;){if(x.x>=f&&x.x<=_&&x.y>=m&&x.y<=p&&x!==i&&x!==a&&na(o,h,l,d,c,u,x.x,x.y)&&Bt(x.prev,x,x.next)>=0)return!1;x=x.nextZ}return!0}function B0(s,e){let t=s;do{const n=t.prev,i=t.next.next;!qs(n,i)&&Gf(n,t,t.next,i)&&ia(n,i)&&ia(i,n)&&(e.push(n.i,t.i,i.i),sa(t),sa(t.next),t=s=i),t=t.next}while(t!==s);return cs(t)}function k0(s,e,t,n,i,r){let a=s;do{let o=a.next.next;for(;o!==a.prev;){if(a.i!==o.i&&$0(a,o)){let l=Wf(a,o);a=cs(a,a.next),l=cs(l,l.next),ta(a,e,t,n,i,r,0),ta(l,e,t,n,i,r,0);return}o=o.next}a=a.next}while(a!==s)}function V0(s,e,t,n){const i=[];for(let r=0,a=e.length;r<a;r++){const o=e[r]*n,l=r<a-1?e[r+1]*n:s.length,c=Vf(s,o,l,n,!1);c===c.next&&(c.steiner=!0),i.push(Z0(c))}i.sort(H0);for(let r=0;r<i.length;r++)t=G0(i[r],t);return t}function H0(s,e){let t=s.x-e.x;if(t===0&&(t=s.y-e.y,t===0)){const n=(s.next.y-s.y)/(s.next.x-s.x),i=(e.next.y-e.y)/(e.next.x-e.x);t=n-i}return t}function G0(s,e){const t=W0(s,e);if(!t)return e;const n=Wf(t,s);return cs(n,n.next),cs(t,t.next)}function W0(s,e){let t=e;const n=s.x,i=s.y;let r=-1/0,a;if(qs(s,t))return t;do{if(qs(s,t.next))return t.next;if(i<=t.y&&i>=t.next.y&&t.next.y!==t.y){const d=t.x+(i-t.y)*(t.next.x-t.x)/(t.next.y-t.y);if(d<=n&&d>r&&(r=d,a=t.x<t.next.x?t:t.next,d===n))return a}t=t.next}while(t!==e);if(!a)return null;const o=a,l=a.x,c=a.y;let h=1/0;t=a;do{if(n>=t.x&&t.x>=l&&n!==t.x&&Hf(i<c?n:r,i,l,c,i<c?r:n,i,t.x,t.y)){const d=Math.abs(i-t.y)/(n-t.x);ia(t,s)&&(d<h||d===h&&(t.x>a.x||t.x===a.x&&X0(a,t)))&&(a=t,h=d)}t=t.next}while(t!==o);return a}function X0(s,e){return Bt(s.prev,s,e.prev)<0&&Bt(e.next,s,s.next)<0}function Y0(s,e,t,n){let i=s;do i.z===0&&(i.z=$c(i.x,i.y,e,t,n)),i.prevZ=i.prev,i.nextZ=i.next,i=i.next;while(i!==s);i.prevZ.nextZ=null,i.prevZ=null,q0(i)}function q0(s){let e,t=1;do{let n=s,i;s=null;let r=null;for(e=0;n;){e++;let a=n,o=0;for(let c=0;c<t&&(o++,a=a.nextZ,!!a);c++);let l=t;for(;o>0||l>0&&a;)o!==0&&(l===0||!a||n.z<=a.z)?(i=n,n=n.nextZ,o--):(i=a,a=a.nextZ,l--),r?r.nextZ=i:s=i,i.prevZ=r,r=i;n=a}r.nextZ=null,t*=2}while(e>1);return s}function $c(s,e,t,n,i){return s=(s-t)*i|0,e=(e-n)*i|0,s=(s|s<<8)&16711935,s=(s|s<<4)&252645135,s=(s|s<<2)&858993459,s=(s|s<<1)&1431655765,e=(e|e<<8)&16711935,e=(e|e<<4)&252645135,e=(e|e<<2)&858993459,e=(e|e<<1)&1431655765,s|e<<1}function Z0(s){let e=s,t=s;do(e.x<t.x||e.x===t.x&&e.y<t.y)&&(t=e),e=e.next;while(e!==s);return t}function Hf(s,e,t,n,i,r,a,o){return(i-a)*(e-o)>=(s-a)*(r-o)&&(s-a)*(n-o)>=(t-a)*(e-o)&&(t-a)*(r-o)>=(i-a)*(n-o)}function na(s,e,t,n,i,r,a,o){return!(s===a&&e===o)&&Hf(s,e,t,n,i,r,a,o)}function $0(s,e){return s.next.i!==e.i&&s.prev.i!==e.i&&!K0(s,e)&&(ia(s,e)&&ia(e,s)&&J0(s,e)&&(Bt(s.prev,s,e.prev)||Bt(s,e.prev,e))||qs(s,e)&&Bt(s.prev,s,s.next)>0&&Bt(e.prev,e,e.next)>0)}function Bt(s,e,t){return(e.y-s.y)*(t.x-e.x)-(e.x-s.x)*(t.y-e.y)}function qs(s,e){return s.x===e.x&&s.y===e.y}function Gf(s,e,t,n){const i=wo(Bt(s,e,t)),r=wo(Bt(s,e,n)),a=wo(Bt(t,n,s)),o=wo(Bt(t,n,e));return!!(i!==r&&a!==o||i===0&&So(s,t,e)||r===0&&So(s,n,e)||a===0&&So(t,s,n)||o===0&&So(t,e,n))}function So(s,e,t){return e.x<=Math.max(s.x,t.x)&&e.x>=Math.min(s.x,t.x)&&e.y<=Math.max(s.y,t.y)&&e.y>=Math.min(s.y,t.y)}function wo(s){return s>0?1:s<0?-1:0}function K0(s,e){let t=s;do{if(t.i!==s.i&&t.next.i!==s.i&&t.i!==e.i&&t.next.i!==e.i&&Gf(t,t.next,s,e))return!0;t=t.next}while(t!==s);return!1}function ia(s,e){return Bt(s.prev,s,s.next)<0?Bt(s,e,s.next)>=0&&Bt(s,s.prev,e)>=0:Bt(s,e,s.prev)<0||Bt(s,s.next,e)<0}function J0(s,e){let t=s,n=!1;const i=(s.x+e.x)/2,r=(s.y+e.y)/2;do t.y>r!=t.next.y>r&&t.next.y!==t.y&&i<(t.next.x-t.x)*(r-t.y)/(t.next.y-t.y)+t.x&&(n=!n),t=t.next;while(t!==s);return n}function Wf(s,e){const t=Kc(s.i,s.x,s.y),n=Kc(e.i,e.x,e.y),i=s.next,r=e.prev;return s.next=e,e.prev=s,t.next=i,i.prev=t,n.next=t,t.prev=n,r.next=n,n.prev=r,n}function Xf(s,e,t,n){const i=Kc(s,e,t);return n?(i.next=n.next,i.prev=n,n.next.prev=i,n.next=i):(i.prev=i,i.next=i),i}function sa(s){s.next.prev=s.prev,s.prev.next=s.next,s.prevZ&&(s.prevZ.nextZ=s.nextZ),s.nextZ&&(s.nextZ.prevZ=s.prevZ)}function Kc(s,e,t){return{i:s,x:e,y:t,prev:null,next:null,z:0,prevZ:null,nextZ:null,steiner:!1}}function j0(s,e,t,n){let i=0;for(let r=e,a=t-n;r<t;r+=n)i+=(s[a]-s[r])*(s[r+1]+s[a+1]),a=r;return i}class Q0{static triangulate(e,t,n=2){return z0(e,t,n)}}class ra{static area(e){const t=e.length;let n=0;for(let i=t-1,r=0;r<t;i=r++)n+=e[i].x*e[r].y-e[r].x*e[i].y;return n*.5}static isClockWise(e){return ra.area(e)<0}static triangulateShape(e,t){const n=[],i=[],r=[];Yf(e),qf(n,e);let a=e.length;t.forEach(Yf);for(let l=0;l<t.length;l++)i.push(a),a+=t[l].length,qf(n,t[l]);const o=Q0.triangulate(n,i);for(let l=0;l<o.length;l+=3)r.push(o.slice(l,l+3));return r}}function Yf(s){const e=s.length;e>2&&s[e-1].equals(s[0])&&s.pop()}function qf(s,e){for(let t=0;t<e.length;t++)s.push(e[t].x),s.push(e[t].y)}class aa extends jr{constructor(e=1,t=0){const n=(1+Math.sqrt(5))/2,i=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1],r=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(i,r,e,t),this.type="IcosahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new aa(e.radius,e.detail)}}class Jc extends At{constructor(e=[new pe(0,-.5),new pe(.5,0),new pe(0,.5)],t=12,n=0,i=Math.PI*2){super(),this.type="LatheGeometry",this.parameters={points:e,segments:t,phiStart:n,phiLength:i},t=Math.floor(t),i=Je(i,0,Math.PI*2);const r=[],a=[],o=[],l=[],c=[],h=1/t,d=new L,u=new pe,f=new L,m=new L,_=new L;let p=0,g=0;for(let v=0;v<=e.length-1;v++)switch(v){case 0:p=e[v+1].x-e[v].x,g=e[v+1].y-e[v].y,f.x=g*1,f.y=-p,f.z=g*0,_.copy(f),f.normalize(),l.push(f.x,f.y,f.z);break;case e.length-1:l.push(_.x,_.y,_.z);break;default:p=e[v+1].x-e[v].x,g=e[v+1].y-e[v].y,f.x=g*1,f.y=-p,f.z=g*0,m.copy(f),f.x+=_.x,f.y+=_.y,f.z+=_.z,f.normalize(),l.push(f.x,f.y,f.z),_.copy(m)}for(let v=0;v<=t;v++){const M=n+v*h*i,x=Math.sin(M),w=Math.cos(M);for(let S=0;S<=e.length-1;S++){d.x=e[S].x*x,d.y=e[S].y,d.z=e[S].x*w,a.push(d.x,d.y,d.z),u.x=v/t,u.y=S/(e.length-1),o.push(u.x,u.y);const A=l[3*S+0]*x,y=l[3*S+1],T=l[3*S+0]*w;c.push(A,y,T)}}for(let v=0;v<t;v++)for(let M=0;M<e.length-1;M++){const x=M+v*e.length,w=x,S=x+e.length,A=x+e.length+1,y=x+1;r.push(w,S,y),r.push(A,y,S)}this.setIndex(r),this.setAttribute("position",new je(a,3)),this.setAttribute("uv",new je(o,2)),this.setAttribute("normal",new je(c,3))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Jc(e.points,e.segments,e.phiStart,e.phiLength)}}class jc extends jr{constructor(e=1,t=0){const n=[1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],i=[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2];super(n,i,e,t),this.type="OctahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new jc(e.radius,e.detail)}}class ni extends At{constructor(e=1,t=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:i};const r=e/2,a=t/2,o=Math.floor(n),l=Math.floor(i),c=o+1,h=l+1,d=e/o,u=t/l,f=[],m=[],_=[],p=[];for(let g=0;g<h;g++){const v=g*u-a;for(let M=0;M<c;M++){const x=M*d-r;m.push(x,-v,0),_.push(0,0,1),p.push(M/o),p.push(1-g/l)}}for(let g=0;g<l;g++)for(let v=0;v<o;v++){const M=v+c*g,x=v+c*(g+1),w=v+1+c*(g+1),S=v+1+c*g;f.push(M,x,S),f.push(x,w,S)}this.setIndex(f),this.setAttribute("position",new je(m,3)),this.setAttribute("normal",new je(_,3)),this.setAttribute("uv",new je(p,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new ni(e.width,e.height,e.widthSegments,e.heightSegments)}}class oa extends At{constructor(e=.5,t=1,n=32,i=1,r=0,a=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:e,outerRadius:t,thetaSegments:n,phiSegments:i,thetaStart:r,thetaLength:a},n=Math.max(3,n),i=Math.max(1,i);const o=[],l=[],c=[],h=[];let d=e;const u=(t-e)/i,f=new L,m=new pe;for(let _=0;_<=i;_++){for(let p=0;p<=n;p++){const g=r+p/n*a;f.x=d*Math.cos(g),f.y=d*Math.sin(g),l.push(f.x,f.y,f.z),c.push(0,0,1),m.x=(f.x/t+1)/2,m.y=(f.y/t+1)/2,h.push(m.x,m.y)}d+=u}for(let _=0;_<i;_++){const p=_*(n+1);for(let g=0;g<n;g++){const v=g+p,M=v,x=v+n+1,w=v+n+2,S=v+1;o.push(M,x,S),o.push(x,w,S)}}this.setIndex(o),this.setAttribute("position",new je(l,3)),this.setAttribute("normal",new je(c,3)),this.setAttribute("uv",new je(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new oa(e.innerRadius,e.outerRadius,e.thetaSegments,e.phiSegments,e.thetaStart,e.thetaLength)}}class Qc extends At{constructor(e=new kf([new pe(0,.5),new pe(-.5,-.5),new pe(.5,-.5)]),t=12){super(),this.type="ShapeGeometry",this.parameters={shapes:e,curveSegments:t};const n=[],i=[],r=[],a=[];let o=0,l=0;if(Array.isArray(e)===!1)c(e);else for(let h=0;h<e.length;h++)c(e[h]),this.addGroup(o,l,h),o+=l,l=0;this.setIndex(n),this.setAttribute("position",new je(i,3)),this.setAttribute("normal",new je(r,3)),this.setAttribute("uv",new je(a,2));function c(h){const d=i.length/3,u=h.extractPoints(t);let f=u.shape;const m=u.holes;ra.isClockWise(f)===!1&&(f=f.reverse());for(let p=0,g=m.length;p<g;p++){const v=m[p];ra.isClockWise(v)===!0&&(m[p]=v.reverse())}const _=ra.triangulateShape(f,m);for(let p=0,g=m.length;p<g;p++){const v=m[p];f=f.concat(v)}for(let p=0,g=f.length;p<g;p++){const v=f[p];i.push(v.x,v.y,0),r.push(0,0,1),a.push(v.x,v.y)}for(let p=0,g=_.length;p<g;p++){const v=_[p],M=v[0]+d,x=v[1]+d,w=v[2]+d;n.push(M,x,w),l+=3}}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}toJSON(){const e=super.toJSON(),t=this.parameters.shapes;return eg(t,e)}static fromJSON(e,t){const n=[];for(let i=0,r=e.shapes.length;i<r;i++){const a=t[e.shapes[i]];n.push(a)}return new Qc(n,e.curveSegments)}}function eg(s,e){if(e.shapes=[],Array.isArray(s))for(let t=0,n=s.length;t<n;t++){const i=s[t];e.shapes.push(i.uuid)}else e.shapes.push(s.uuid);return e}class Dn extends At{constructor(e=1,t=32,n=16,i=0,r=Math.PI*2,a=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:i,phiLength:r,thetaStart:a,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));const l=Math.min(a+o,Math.PI);let c=0;const h=[],d=new L,u=new L,f=[],m=[],_=[],p=[];for(let g=0;g<=n;g++){const v=[],M=g/n,x=a+M*o,w=e*Math.cos(x),S=Math.sqrt(e*e-w*w);let A=0;g===0&&a===0?A=.5/t:g===n&&l===Math.PI&&(A=-.5/t);for(let y=0;y<=t;y++){const T=y/t,C=i+T*r;d.x=-S*Math.cos(C),d.y=w,d.z=S*Math.sin(C),m.push(d.x,d.y,d.z),u.copy(d).normalize(),_.push(u.x,u.y,u.z),p.push(T+A,1-M),v.push(c++)}h.push(v)}for(let g=0;g<n;g++)for(let v=0;v<t;v++){const M=h[g][v+1],x=h[g][v],w=h[g+1][v],S=h[g+1][v+1];(g!==0||a>0)&&f.push(M,x,S),(g!==n-1||l<Math.PI)&&f.push(x,w,S)}this.setIndex(f),this.setAttribute("position",new je(m,3)),this.setAttribute("normal",new je(_,3)),this.setAttribute("uv",new je(p,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Dn(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}}class la extends At{constructor(e=1,t=.4,n=12,i=48,r=Math.PI*2,a=0,o=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:e,tube:t,radialSegments:n,tubularSegments:i,arc:r,thetaStart:a,thetaLength:o},n=Math.floor(n),i=Math.floor(i);const l=[],c=[],h=[],d=[],u=new L,f=new L,m=new L;for(let _=0;_<=n;_++){const p=a+_/n*o;for(let g=0;g<=i;g++){const v=g/i*r;f.x=(e+t*Math.cos(p))*Math.cos(v),f.y=(e+t*Math.cos(p))*Math.sin(v),f.z=t*Math.sin(p),c.push(f.x,f.y,f.z),u.x=e*Math.cos(v),u.y=e*Math.sin(v),m.subVectors(f,u).normalize(),h.push(m.x,m.y,m.z),d.push(g/i),d.push(_/n)}}for(let _=1;_<=n;_++)for(let p=1;p<=i;p++){const g=(i+1)*_+p-1,v=(i+1)*(_-1)+p-1,M=(i+1)*(_-1)+p,x=(i+1)*_+p;l.push(g,v,x),l.push(v,M,x)}this.setIndex(l),this.setAttribute("position",new je(c,3)),this.setAttribute("normal",new je(h,3)),this.setAttribute("uv",new je(d,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new la(e.radius,e.tube,e.radialSegments,e.tubularSegments,e.arc,e.thetaStart,e.thetaLength)}}class eh extends At{constructor(e=new Ff(new L(-1,-1,0),new L(-1,1,0),new L(1,1,0)),t=64,n=1,i=8,r=!1){super(),this.type="TubeGeometry",this.parameters={path:e,tubularSegments:t,radius:n,radialSegments:i,closed:r};const a=e.computeFrenetFrames(t,r);this.tangents=a.tangents,this.normals=a.normals,this.binormals=a.binormals;const o=new L,l=new L,c=new pe;let h=new L;const d=[],u=[],f=[],m=[];_(),this.setIndex(m),this.setAttribute("position",new je(d,3)),this.setAttribute("normal",new je(u,3)),this.setAttribute("uv",new je(f,2));function _(){for(let M=0;M<t;M++)p(M);p(r===!1?t:0),v(),g()}function p(M){h=e.getPointAt(M/t,h);const x=a.normals[M],w=a.binormals[M];for(let S=0;S<=i;S++){const A=S/i*Math.PI*2,y=Math.sin(A),T=-Math.cos(A);l.x=T*x.x+y*w.x,l.y=T*x.y+y*w.y,l.z=T*x.z+y*w.z,l.normalize(),u.push(l.x,l.y,l.z),o.x=h.x+n*l.x,o.y=h.y+n*l.y,o.z=h.z+n*l.z,d.push(o.x,o.y,o.z)}}function g(){for(let M=1;M<=t;M++)for(let x=1;x<=i;x++){const w=(i+1)*(M-1)+(x-1),S=(i+1)*M+(x-1),A=(i+1)*M+x,y=(i+1)*(M-1)+x;m.push(w,S,y),m.push(S,A,y)}}function v(){for(let M=0;M<=t;M++)for(let x=0;x<=i;x++)c.x=M/t,c.y=x/i,f.push(c.x,c.y)}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}toJSON(){const e=super.toJSON();return e.path=this.parameters.path.toJSON(),e}static fromJSON(e){return new eh(new Zc[e.path.type]().fromJSON(e.path),e.tubularSegments,e.radius,e.radialSegments,e.closed)}}function Zs(s){const e={};for(const t in s){e[t]={};for(const n in s[t]){const i=s[t][n];if(Zf(i))i.isRenderTargetTexture?(Fe("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=i.clone();else if(Array.isArray(i))if(Zf(i[0])){const r=[];for(let a=0,o=i.length;a<o;a++)r[a]=i[a].clone();e[t][n]=r}else e[t][n]=i.slice();else e[t][n]=i}}return e}function Mn(s){const e={};for(let t=0;t<s.length;t++){const n=Zs(s[t]);for(const i in n)e[i]=n[i]}return e}function Zf(s){return s&&(s.isColor||s.isMatrix3||s.isMatrix4||s.isVector2||s.isVector3||s.isVector4||s.isTexture||s.isQuaternion)}function tg(s){const e=[];for(let t=0;t<s.length;t++)e.push(s[t].clone());return e}function $f(s){const e=s.getRenderTarget();return e===null?s.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:st.workingColorSpace}const ii={clone:Zs,merge:Mn};var ng=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,ig=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class gt extends Ln{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=ng,this.fragmentShader=ig,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Zs(e.uniforms),this.uniformsGroups=tg(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){const t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(const i in this.uniforms){const a=this.uniforms[i].value;a&&a.isTexture?t.uniforms[i]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[i]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[i]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[i]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[i]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[i]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[i]={type:"m4",value:a.toArray()}:t.uniforms[i]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;const n={};for(const i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(const n in e.uniforms){const i=e.uniforms[n];switch(this.uniforms[n]={},i.type){case"t":this.uniforms[n].value=t[i.value]||null;break;case"c":this.uniforms[n].value=new ge().setHex(i.value);break;case"v2":this.uniforms[n].value=new pe().fromArray(i.value);break;case"v3":this.uniforms[n].value=new L().fromArray(i.value);break;case"v4":this.uniforms[n].value=new Mt().fromArray(i.value);break;case"m3":this.uniforms[n].value=new Ze().fromArray(i.value);break;case"m4":this.uniforms[n].value=new De().fromArray(i.value);break;default:this.uniforms[n].value=i.value}}if(e.defines!==void 0&&(this.defines=e.defines),e.vertexShader!==void 0&&(this.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(this.fragmentShader=e.fragmentShader),e.glslVersion!==void 0&&(this.glslVersion=e.glslVersion),e.extensions!==void 0)for(const n in e.extensions)this.extensions[n]=e.extensions[n];return e.lights!==void 0&&(this.lights=e.lights),e.clipping!==void 0&&(this.clipping=e.clipping),this}}class Kf extends gt{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}}class th extends Ln{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new ge(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ge(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Dr,this.normalScale=new pe(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new kn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}}class di extends th{constructor(e){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new pe(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return Je(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(t){this.ior=(1+.4*t)/(1-.4*t)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new ge(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new ge(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new ge(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._retroreflectivity=0,this._sheen=0,this._transmission=0,this.setValues(e)}get anisotropy(){return this._anisotropy}set anisotropy(e){this._anisotropy>0!=e>0&&this.version++,this._anisotropy=e}get clearcoat(){return this._clearcoat}set clearcoat(e){this._clearcoat>0!=e>0&&this.version++,this._clearcoat=e}get iridescence(){return this._iridescence}set iridescence(e){this._iridescence>0!=e>0&&this.version++,this._iridescence=e}get dispersion(){return this._dispersion}set dispersion(e){this._dispersion>0!=e>0&&this.version++,this._dispersion=e}get retroreflectivity(){return this._retroreflectivity}set retroreflectivity(e){this._retroreflectivity>0!=e>0&&this.version++,this._retroreflectivity=e}get sheen(){return this._sheen}set sheen(e){this._sheen>0!=e>0&&this.version++,this._sheen=e}get transmission(){return this._transmission}set transmission(e){this._transmission>0!=e>0&&this.version++,this._transmission=e}copy(e){return super.copy(e),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=e.anisotropy,this.anisotropyRotation=e.anisotropyRotation,this.anisotropyMap=e.anisotropyMap,this.clearcoat=e.clearcoat,this.clearcoatMap=e.clearcoatMap,this.clearcoatRoughness=e.clearcoatRoughness,this.clearcoatRoughnessMap=e.clearcoatRoughnessMap,this.clearcoatNormalMap=e.clearcoatNormalMap,this.clearcoatNormalScale.copy(e.clearcoatNormalScale),this.dispersion=e.dispersion,this.ior=e.ior,this.iridescence=e.iridescence,this.iridescenceMap=e.iridescenceMap,this.iridescenceIOR=e.iridescenceIOR,this.iridescenceThicknessRange=[...e.iridescenceThicknessRange],this.iridescenceThicknessMap=e.iridescenceThicknessMap,this.retroreflectivity=e.retroreflectivity,this.sheen=e.sheen,this.sheenColor.copy(e.sheenColor),this.sheenColorMap=e.sheenColorMap,this.sheenRoughness=e.sheenRoughness,this.sheenRoughnessMap=e.sheenRoughnessMap,this.transmission=e.transmission,this.transmissionMap=e.transmissionMap,this.thickness=e.thickness,this.thicknessMap=e.thicknessMap,this.attenuationDistance=e.attenuationDistance,this.attenuationColor.copy(e.attenuationColor),this.specularIntensity=e.specularIntensity,this.specularIntensityMap=e.specularIntensityMap,this.specularColor.copy(e.specularColor),this.specularColorMap=e.specularColorMap,this}}class sg extends Ln{constructor(e){super(),this.isMeshNormalMaterial=!0,this.type="MeshNormalMaterial",this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Dr,this.normalScale=new pe(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.flatShading=!1,this.setValues(e)}copy(e){return super.copy(e),this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.flatShading=e.flatShading,this}}class ht extends Ln{constructor(e){super(),this.isMeshLambertMaterial=!0,this.type="MeshLambertMaterial",this.color=new ge(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ge(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Dr,this.normalScale=new pe(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new kn,this.combine=gl,this.reflectivity=1,this.envMapIntensity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.envMapIntensity=e.envMapIntensity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}}class rg extends Ln{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=_m,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class ag extends Ln{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}function Zi(s,e){return!s||s.constructor===e?s:typeof e.BYTES_PER_ELEMENT=="number"?new e(s):Array.prototype.slice.call(s)}function bo(s){return s!==void 0&&s.inTangents!==void 0&&s.outTangents!==void 0}function og(s){function e(i,r){return s[i]-s[r]}const t=s.length,n=new Array(t);for(let i=0;i!==t;++i)n[i]=i;return n.sort(e),n}function Jf(s,e,t){const n=s.length,i=new s.constructor(n);for(let r=0,a=0;a!==n;++r){const o=t[r]*e;for(let l=0;l!==e;++l)i[a++]=s[o+l]}return i}function lg(s,e,t,n){let i=1,r=s[0];for(;r!==void 0&&r[n]===void 0;)r=s[i++];if(r===void 0)return;let a=r[n];if(a!==void 0)if(Array.isArray(a))do a=r[n],a!==void 0&&(e.push(r.time),t.push(...a)),r=s[i++];while(r!==void 0);else if(a.toArray!==void 0)do a=r[n],a!==void 0&&(e.push(r.time),a.toArray(t,t.length)),r=s[i++];while(r!==void 0);else do a=r[n],a!==void 0&&(e.push(r.time),t.push(a)),r=s[i++];while(r!==void 0)}class $s{constructor(e,t,n,i){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){const t=this.parameterPositions;let n=this._cachedIndex,i=t[n],r=t[n-1];n:{e:{let a;t:{i:if(!(e<i)){for(let o=n+2;;){if(i===void 0){if(e<r)break i;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(r=i,i=t[++n],e<i)break e}a=t.length;break t}if(!(e>=r)){const o=t[1];e<o&&(n=2,r=o);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(i=r,r=t[--n-1],e>=r)break e}a=n,n=0;break t}break n}for(;n<a;){const o=n+a>>>1;e<t[o]?a=o:n=o+1}if(i=t[n],r=t[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,e,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){const t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=e*i;for(let a=0;a!==i;++a)t[a]=n[r+a];return t}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}}class cg extends $s{constructor(e,t,n,i){super(e,t,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:Du,endingEnd:Du}}intervalChanged_(e,t,n){const i=this.parameterPositions;let r=e-2,a=e+1,o=i[r],l=i[a];if(o===void 0)switch(this.getSettings_().endingStart){case Uu:r=e,o=2*t-n;break;case Nu:r=i.length-2,o=t+i[r]-i[r+1];break;default:r=e,o=n}if(l===void 0)switch(this.getSettings_().endingEnd){case Uu:a=e,l=2*n-t;break;case Nu:a=1,l=n+i[1]-i[0];break;default:a=e-1,l=t}const c=(n-t)*.5,h=this.valueSize;this._weightPrev=c/(t-o),this._weightNext=c/(l-n),this._offsetPrev=r*h,this._offsetNext=a*h}interpolate_(e,t,n,i){const r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,h=this._offsetPrev,d=this._offsetNext,u=this._weightPrev,f=this._weightNext,m=(n-t)/(i-t),_=m*m,p=_*m,g=-u*p+2*u*_-u*m,v=(1+u)*p+(-1.5-2*u)*_+(-.5+u)*m+1,M=(-1-f)*p+(1.5+f)*_+.5*m,x=f*p-f*_;for(let w=0;w!==o;++w)r[w]=g*a[h+w]+v*a[c+w]+M*a[l+w]+x*a[d+w];return r}}class hg extends $s{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){const r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,h=(n-t)/(i-t),d=1-h;for(let u=0;u!==o;++u)r[u]=a[c+u]*d+a[l+u]*h;return r}}class ug extends $s{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e){return this.copySampleValue_(e-1)}}class fg extends $s{interpolate_(e,t,n,i){const r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,h=this.inTangents,d=this.outTangents;if(!h||!d){const m=(n-t)/(i-t),_=1-m;for(let p=0;p!==o;++p)r[p]=a[c+p]*_+a[l+p]*m;return r}const u=o*2,f=e-1;for(let m=0;m!==o;++m){const _=a[c+m],p=a[l+m],g=f*u+m*2,v=d[g],M=d[g+1],x=e*u+m*2,w=h[x],S=h[x+1],A=pg(n,t,v,w,i);r[m]=jf(A,_,M,S,p)}return r}}function jf(s,e,t,n,i){const r=1-s;return r*r*r*e+3*r*r*s*t+3*r*s*s*n+s*s*s*i}function dg(s,e,t,n,i){const r=1-s;return 3*r*r*(t-e)+6*r*s*(n-t)+3*s*s*(i-n)}function pg(s,e,t,n,i){let r=(s-e)/(i-e);for(let a=0;a<8;a++){const o=jf(r,e,t,n,i)-s;if(Math.abs(o)<1e-10)break;const l=dg(r,e,t,n,i);if(Math.abs(l)<1e-10)break;r=Math.max(0,Math.min(1,r-o/l))}return r}class si{constructor(e,t,n,i){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=Zi(t,this.TimeBufferType),this.values=Zi(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(e){const t=e.constructor;let n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:Zi(e.times,Array),values:Zi(e.values,Array)};const i=e.getInterpolation();i!==e.DefaultInterpolation&&(n.interpolation=i),bo(e.settings)&&(n.settings={inTangents:Zi(e.settings.inTangents,Array),outTangents:Zi(e.settings.outTangents,Array)})}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new ug(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new hg(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new cg(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodBezier(e){const t=new fg(this.times,this.values,this.getValueSize(),e);return this.settings&&(t.inTangents=this.settings.inTangents,t.outTangents=this.settings.outTangents),t}setInterpolation(e){let t;switch(e){case Ir:t=this.InterpolantFactoryMethodDiscrete;break;case Lr:t=this.InterpolantFactoryMethodLinear;break;case ac:t=this.InterpolantFactoryMethodSmooth;break;case Lu:t=this.InterpolantFactoryMethodBezier;break}if(t===void 0){const n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return Fe("KeyframeTrack:",n),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Ir;case this.InterpolantFactoryMethodLinear:return Lr;case this.InterpolantFactoryMethodSmooth:return ac;case this.InterpolantFactoryMethodBezier:return Lu}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){const t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]+=e}return this}scale(e){if(e!==1){const t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]*=e;bo(this.settings)&&(Qf(this.settings.inTangents,e),Qf(this.settings.outTangents,e))}return this}trim(e,t){const n=this.times,i=n.length;let r=0,a=i-1;for(;r!==i&&n[r]<e;)++r;for(;a!==-1&&n[a]>t;)--a;if(++a,r!==0||a!==i){r>=a&&(a=Math.max(a,1),r=a-1);const o=this.getValueSize();this.times=n.slice(r,a),this.values=this.values.slice(r*o,a*o)}return this}validate(){let e=!0;const t=this.getValueSize();t-Math.floor(t)!==0&&(He("KeyframeTrack: Invalid value size in track.",this),e=!1);const n=this.times,i=this.values,r=n.length;r===0&&(He("KeyframeTrack: Track is empty.",this),e=!1);let a=null;for(let o=0;o!==r;o++){const l=n[o];if(typeof l=="number"&&isNaN(l)){He("KeyframeTrack: Time is not a valid number.",this,o,l),e=!1;break}if(a!==null&&a>l){He("KeyframeTrack: Out of order keys.",this,o,l,a),e=!1;break}a=l}if(i!==void 0&&Rm(i))for(let o=0,l=i.length;o!==l;++o){const c=i[o];if(isNaN(c)){He("KeyframeTrack: Value is not a valid number.",this,o,c),e=!1;break}}return e}optimize(){const e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===ac,r=e.length-1;let a=1;for(let o=1;o<r;++o){let l=!1;const c=e[o],h=e[o+1];if(c!==h&&(o!==1||c!==e[0]))if(i)l=!0;else{const d=o*n,u=d-n,f=d+n;for(let m=0;m!==n;++m){const _=t[d+m];if(_!==t[u+m]||_!==t[f+m]){l=!0;break}}}if(l){if(o!==a){e[a]=e[o];const d=o*n,u=a*n;for(let f=0;f!==n;++f)t[u+f]=t[d+f]}++a}}if(r>0){e[a]=e[r];for(let o=r*n,l=a*n,c=0;c!==n;++c)t[l+c]=t[o+c];++a}return a!==e.length?(this.times=e.slice(0,a),this.values=t.slice(0,a*n)):(this.times=e,this.values=t),this}clone(){const e=this.times.slice(),t=this.values.slice(),n=this.constructor,i=new n(this.name,e,t);return i.createInterpolant=this.createInterpolant,bo(this.settings)&&(i.settings={inTangents:this.settings.inTangents.slice(),outTangents:this.settings.outTangents.slice()}),i}}function Qf(s,e){for(let t=0,n=s.length;t!==n;t+=2)s[t]*=e}si.prototype.ValueTypeName="",si.prototype.TimeBufferType=Float32Array,si.prototype.ValueBufferType=Float32Array,si.prototype.DefaultInterpolation=Lr;class Ks extends si{constructor(e,t,n){super(e,t,n)}}Ks.prototype.ValueTypeName="bool",Ks.prototype.ValueBufferType=Array,Ks.prototype.DefaultInterpolation=Ir,Ks.prototype.InterpolantFactoryMethodLinear=void 0,Ks.prototype.InterpolantFactoryMethodSmooth=void 0;class ed extends si{constructor(e,t,n,i){super(e,t,n,i)}}ed.prototype.ValueTypeName="color";class ca extends si{constructor(e,t,n,i){super(e,t,n,i)}}ca.prototype.ValueTypeName="number";class mg extends $s{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){const r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=(n-t)/(i-t);let c=e*o;for(let h=c+o;c!==h;c+=4)Jt.slerpFlat(r,0,a,c-o,a,c,l);return r}}class ha extends si{constructor(e,t,n,i){super(e,t,n,i)}InterpolantFactoryMethodLinear(e){return new mg(this.times,this.values,this.getValueSize(),e)}}ha.prototype.ValueTypeName="quaternion",ha.prototype.InterpolantFactoryMethodSmooth=void 0;class Js extends si{constructor(e,t,n){super(e,t,n)}}Js.prototype.ValueTypeName="string",Js.prototype.ValueBufferType=Array,Js.prototype.DefaultInterpolation=Ir,Js.prototype.InterpolantFactoryMethodLinear=void 0,Js.prototype.InterpolantFactoryMethodSmooth=void 0;class To extends si{constructor(e,t,n,i){super(e,t,n,i)}}To.prototype.ValueTypeName="vector";class gg{constructor(e="",t=-1,n=[],i=xm){this.name=e,this.tracks=n,this.duration=t,this.blendMode=i,this.uuid=Bn(),this.userData={},this.duration<0&&this.resetDuration()}static parse(e){const t=[],n=e.tracks,i=1/(e.fps||1);for(let a=0,o=n.length;a!==o;++a)t.push(vg(n[a]).scale(i));const r=new this(e.name,e.duration,t,e.blendMode);return r.uuid=e.uuid,r.userData=JSON.parse(e.userData||"{}"),r}static toJSON(e){const t=[],n=e.tracks,i={name:e.name,duration:e.duration,tracks:t,uuid:e.uuid,blendMode:e.blendMode,userData:JSON.stringify(e.userData)};for(let r=0,a=n.length;r!==a;++r)t.push(si.toJSON(n[r]));return i}static CreateFromMorphTargetSequence(e,t,n,i){const r=t.length,a=[];for(let o=0;o<r;o++){let l=[],c=[];l.push((o+r-1)%r,o,(o+1)%r),c.push(0,1,0);const h=og(l);l=Jf(l,1,h),c=Jf(c,1,h),!i&&l[0]===0&&(l.push(r),c.push(c[0])),a.push(new ca(".morphTargetInfluences["+t[o].name+"]",l,c).scale(1/n))}return new this(e,-1,a)}static findByName(e,t){let n=e;if(!Array.isArray(e)){const i=e;n=i.geometry&&i.geometry.animations||i.animations}for(let i=0;i<n.length;i++)if(n[i].name===t)return n[i];return null}static CreateClipsFromMorphTargetSequences(e,t,n){const i={},r=/^([\w-]*?)([\d]+)$/;for(let o=0,l=e.length;o<l;o++){const c=e[o],h=c.name.match(r);if(h&&h.length>1){const d=h[1];let u=i[d];u||(i[d]=u=[]),u.push(c)}}const a=[];for(const o in i)a.push(this.CreateFromMorphTargetSequence(o,i[o],t,n));return a}resetDuration(){const e=this.tracks;let t=0;for(let n=0,i=e.length;n!==i;++n){const r=this.tracks[n];t=Math.max(t,r.times[r.times.length-1])}return this.duration=t,this}trim(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].trim(0,this.duration);return this}validate(){let e=!0;for(let t=0;t<this.tracks.length;t++)e=e&&this.tracks[t].validate();return e}optimize(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].optimize();return this}clone(){const e=[];for(let n=0;n<this.tracks.length;n++)e.push(this.tracks[n].clone());const t=new this.constructor(this.name,this.duration,e,this.blendMode);return t.userData=JSON.parse(JSON.stringify(this.userData)),t}toJSON(){return this.constructor.toJSON(this)}}function xg(s){switch(s.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return ca;case"vector":case"vector2":case"vector3":case"vector4":return To;case"color":return ed;case"quaternion":return ha;case"bool":case"boolean":return Ks;case"string":return Js}throw new Error("THREE.KeyframeTrack: Unsupported typeName: "+s)}function vg(s){if(s.type===void 0)throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");const e=xg(s.type);if(s.times===void 0){const n=[],i=[];lg(s.keys,n,i,"value"),s.times=n,s.values=i}let t;return e.parse!==void 0?t=e.parse(s):t=new e(s.name,s.times,s.values,s.interpolation),bo(s.settings)&&(t.settings={inTangents:Zi(s.settings.inTangents,Float32Array),outTangents:Zi(s.settings.outTangents,Float32Array)}),t}const Ni={enabled:!1,files:{},add:function(s,e){this.enabled!==!1&&(td(s)||(this.files[s]=e))},get:function(s){if(this.enabled!==!1&&!td(s))return this.files[s]},remove:function(s){delete this.files[s]},clear:function(){this.files={}}};function td(s){try{const e=s.slice(s.indexOf(":")+1);return new URL(e).protocol==="blob:"}catch{return!1}}class _g{constructor(e,t,n){const i=this;let r=!1,a=0,o=0,l;const c=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this._abortController=null,this.itemStart=function(h){o++,r===!1&&i.onStart!==void 0&&i.onStart(h,a,o),r=!0},this.itemEnd=function(h){a++,i.onProgress!==void 0&&i.onProgress(h,a,o),a===o&&(r=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(h){i.onError!==void 0&&i.onError(h)},this.resolveURL=function(h){return h=h.normalize("NFC"),l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,d){return c.push(h,d),this},this.removeHandler=function(h){const d=c.indexOf(h);return d!==-1&&c.splice(d,2),this},this.getHandler=function(h){for(let d=0,u=c.length;d<u;d+=2){const f=c[d],m=c[d+1];if(f.global&&(f.lastIndex=0),f.test(h))return m}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}}const Mg=new _g;class js{constructor(e){this.manager=e!==void 0?e:Mg,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(e,t){const n=this;return new Promise(function(i,r){n.load(e,i,t,r)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}abort(){return this}}js.DEFAULT_MATERIAL_NAME="__DEFAULT";const zi={};class yg extends Error{constructor(e,t){super(e),this.response=t}}class nd extends js{constructor(e){super(e),this.mimeType="",this.responseType="",this._abortController=new AbortController}load(e,t,n,i){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);const r=Ni.get(`file:${e}`);if(r!==void 0){this.manager.itemStart(e),setTimeout(()=>{t&&t(r),this.manager.itemEnd(e)},0);return}if(zi[e]!==void 0){zi[e].push({onLoad:t,onProgress:n,onError:i});return}zi[e]=[],zi[e].push({onLoad:t,onProgress:n,onError:i});const a=new Request(e,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin",signal:typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal}),o=this.mimeType,l=this.responseType;fetch(a).then(c=>{if(c.status===200||c.status===0){if(c.status===0&&Fe("FileLoader: HTTP Status 0 received."),typeof ReadableStream>"u"||c.body===void 0||c.body.getReader===void 0)return c;const h=zi[e],d=c.body.getReader(),u=c.headers.get("X-File-Size")||c.headers.get("Content-Length"),f=u?parseInt(u):0,m=f!==0;let _=0;const p=new ReadableStream({start(g){v();function v(){d.read().then(({done:M,value:x})=>{if(M)g.close();else{_+=x.byteLength;const w=new ProgressEvent("progress",{lengthComputable:m,loaded:_,total:f});for(let S=0,A=h.length;S<A;S++){const y=h[S];y.onProgress&&y.onProgress(w)}g.enqueue(x),v()}},M=>{g.error(M)})}}});return new Response(p)}else throw new yg(`fetch for "${c.url}" responded with ${c.status}: ${c.statusText}`,c)}).then(c=>{switch(l){case"arraybuffer":return c.arrayBuffer();case"blob":return c.blob();case"document":return c.text().then(h=>new DOMParser().parseFromString(h,o));case"json":return c.json();default:if(o==="")return c.text();{const d=/charset="?([^;"\s]*)"?/i.exec(o),u=d&&d[1]?d[1].toLowerCase():void 0,f=new TextDecoder(u);return c.arrayBuffer().then(m=>f.decode(m))}}}).then(c=>{Ni.add(`file:${e}`,c);const h=zi[e];delete zi[e];for(let d=0,u=h.length;d<u;d++){const f=h[d];f.onLoad&&f.onLoad(c)}}).catch(c=>{const h=zi[e];if(h===void 0)throw this.manager.itemError(e),c;delete zi[e];for(let d=0,u=h.length;d<u;d++){const f=h[d];f.onError&&f.onError(c)}this.manager.itemError(e)}).finally(()=>{this.manager.itemEnd(e)}),this.manager.itemStart(e)}setResponseType(e){return this.responseType=e,this}setMimeType(e){return this.mimeType=e,this}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}}const Qs=new WeakMap;class Sg extends js{constructor(e){super(e)}load(e,t,n,i){this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);const r=this,a=Ni.get(`image:${e}`);if(a!==void 0){if(a.complete===!0)r.manager.itemStart(e),setTimeout(function(){t&&t(a),r.manager.itemEnd(e)},0);else{let d=Qs.get(a);d===void 0&&(d=[],Qs.set(a,d)),d.push({onLoad:t,onError:i})}return a}const o=Nr("img");function l(){h(),t&&t(this);const d=Qs.get(this)||[];for(let u=0;u<d.length;u++){const f=d[u];f.onLoad&&f.onLoad(this)}Qs.delete(this),r.manager.itemEnd(e)}function c(d){h(),i&&i(d),Ni.remove(`image:${e}`);const u=Qs.get(this)||[];for(let f=0;f<u.length;f++){const m=u[f];m.onError&&m.onError(d)}Qs.delete(this),r.manager.itemError(e),r.manager.itemEnd(e)}function h(){o.removeEventListener("load",l,!1),o.removeEventListener("error",c,!1)}return o.addEventListener("load",l,!1),o.addEventListener("error",c,!1),e.slice(0,5)!=="data:"&&this.crossOrigin!==void 0&&(o.crossOrigin=this.crossOrigin),Ni.add(`image:${e}`,o),r.manager.itemStart(e),o.src=e,o}}class id extends js{constructor(e){super(e)}load(e,t,n,i){const r=new Ft,a=new Sg(this.manager);return a.setCrossOrigin(this.crossOrigin),a.setPath(this.path),a.load(e,function(o){r.image=o,r.needsUpdate=!0,t!==void 0&&t(r)},n,i),r}}class Ao extends Lt{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new ge(e),this.intensity=t}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){const t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}}class wg extends Ao{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(Lt.DEFAULT_UP),this.updateMatrix(),this.groundColor=new ge(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){const t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}}const nh=new De,sd=new L,rd=new L;class ih{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new pe(512,512),this.mapType=vn,this.map=null,this.mapPass=null,this.matrix=new De,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Oc,this._frameExtents=new pe(1,1),this._viewportCount=1,this._viewports=[new Mt(0,0,1,1)]}getViewportCount(){return this._viewportCount}getCamera(){return this.camera}getFrustum(){return this._frustum}updateMatrices(e){const t=this.camera;sd.setFromMatrixPosition(e.matrixWorld),t.position.copy(sd),rd.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(rd),t.updateMatrixWorld(),this._updateMatrix(t,this.matrix,this._frustum)}_updateMatrix(e,t,n,i){nh.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),n.setFromProjectionMatrix(nh,e.coordinateSystem,e.reversedDepth);const r=this._frameExtents,a=i?i.z/r.x:1,o=i?i.w/r.y:1,l=i?i.x/r.x:0,c=i?i.y/r.y:0;e.coordinateSystem===Ur||e.reversedDepth?t.set(.5*a,0,0,.5*a+l,0,.5*o,0,.5*o+c,0,0,1,0,0,0,0,1):t.set(.5*a,0,0,.5*a+l,0,.5*o,0,.5*o+c,0,0,.5,.5,0,0,0,1),t.multiply(nh)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){const e={};return e.intensity=this.intensity,e.bias=this.bias,e.normalBias=this.normalBias,e.radius=this.radius,e.blurSamples=this.blurSamples,e.mapSize=this.mapSize.toArray(),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}}const Eo=new L,Co=new Jt,pi=new L;class ad extends Lt{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new De,this.projectionMatrix=new De,this.projectionMatrixInverse=new De,this.coordinateSystem=ci,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(Eo,Co,pi),pi.x===1&&pi.y===1&&pi.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Eo,Co,pi.set(1,1,1)).invert()}updateWorldMatrix(e,t,n=!1){super.updateWorldMatrix(e,t,n),this.matrixWorld.decompose(Eo,Co,pi),pi.x===1&&pi.y===1&&pi.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Eo,Co,pi.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}}const $i=new L,od=new pe,ld=new pe;class yn extends ad{constructor(e=50,t=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){const t=.5*this.getFilmHeight()/e;this.fov=Es*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){const e=Math.tan(zr*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return Es*2*Math.atan(Math.tan(zr*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){$i.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set($i.x,$i.y).multiplyScalar(-e/$i.z),$i.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set($i.x,$i.y).multiplyScalar(-e/$i.z)}getViewSize(e,t){return this.getViewBounds(e,od,ld),t.subVectors(ld,od)}setViewOffset(e,t,n,i,r,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=this.near;let t=e*Math.tan(zr*.5*this.fov)/this.zoom,n=2*t,i=this.aspect*n,r=-.5*i;const a=this.view;if(this.view!==null&&this.view.enabled){const l=a.fullWidth,c=a.fullHeight;r+=a.offsetX*i/l,t-=a.offsetY*n/c,i*=a.width/l,n*=a.height/c}const o=this.filmOffset;o!==0&&(r+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+i,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}class bg extends ih{constructor(){super(new yn(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(e){const t=this.camera,n=Es*2*e.angle*this.focus,i=this.mapSize.width/this.mapSize.height*this.aspect,r=e.distance||t.far;(n!==t.fov||i!==t.aspect||r!==t.far)&&(t.fov=n,t.aspect=i,t.far=r,t.updateProjectionMatrix()),super.updateMatrices(e)}copy(e){return super.copy(e),this.focus=e.focus,this.aspect=e.aspect,this}toJSON(){const e=super.toJSON();return e.focus=this.focus,e.aspect=this.aspect,e}}class Tg extends Ao{constructor(e,t,n=0,i=Math.PI/3,r=0,a=2){super(e,t),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(Lt.DEFAULT_UP),this.updateMatrix(),this.target=new Lt,this.distance=n,this.angle=i,this.penumbra=r,this.decay=a,this.map=null,this.shadow=new bg}get power(){return this.intensity*Math.PI}set power(e){this.intensity=e/Math.PI}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.angle=e.angle,this.penumbra=e.penumbra,this.decay=e.decay,this.target=e.target.clone(),this.map=e.map,this.shadow=e.shadow.clone(),this}toJSON(e){const t=super.toJSON(e);return t.object.distance=this.distance,t.object.angle=this.angle,t.object.decay=this.decay,t.object.penumbra=this.penumbra,t.object.target=this.target.uuid,this.map&&this.map.isTexture&&(t.object.map=this.map.toJSON(e).uuid),t.object.shadow=this.shadow.toJSON(),t}}class Ag extends ih{constructor(){super(new yn(90,1,.5,500)),this.isPointLightShadow=!0}}class Eg extends Ao{constructor(e,t,n=0,i=2){super(e,t),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new Ag}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}toJSON(e){const t=super.toJSON(e);return t.object.distance=this.distance,t.object.decay=this.decay,t.object.shadow=this.shadow.toJSON(),t}}class ua extends ad{constructor(e=-1,t=1,n=1,i=-1,r=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=i,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,i,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2;let r=n-e,a=n+e,o=i+t,l=i-t;if(this.view!==null&&this.view.enabled){const c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,a=r+c*this.view.width,o-=h*this.view.offsetY,l=o-h*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}}class Cg extends ih{constructor(){super(new ua(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class Ro extends Ao{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(Lt.DEFAULT_UP),this.updateMatrix(),this.target=new Lt,this.shadow=new Cg}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){const t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}}class fa{static extractUrlBase(e){const t=e.lastIndexOf("/");return t===-1?"./":e.slice(0,t+1)}static resolveURL(e,t){return typeof e!="string"||e===""?"":(/^https?:\/\//i.test(t)&&/^\//.test(e)&&(t=t.replace(/(^https?:\/\/[^\/]+).*/i,"$1")),/^(https?:)?\/\//i.test(e)||/^data:.*,.*$/i.test(e)||/^blob:.*$/i.test(e)?e:t+e)}}const sh=new WeakMap;class cd extends js{constructor(e){super(e),this.isImageBitmapLoader=!0,typeof createImageBitmap>"u"&&Fe("ImageBitmapLoader: createImageBitmap() not supported."),typeof fetch>"u"&&Fe("ImageBitmapLoader: fetch() not supported."),this.options={premultiplyAlpha:"none"},this._abortController=new AbortController}setOptions(e){return this.options=e,this}load(e,t,n,i){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);const r=this,a=Ni.get(`image-bitmap:${e}`);if(a!==void 0){if(r.manager.itemStart(e),a.then){a.then(c=>{sh.has(a)===!0?(i&&i(sh.get(a)),r.manager.itemError(e),r.manager.itemEnd(e)):(t&&t(c),r.manager.itemEnd(e))});return}setTimeout(function(){t&&t(a),r.manager.itemEnd(e)},0);return}const o={};o.credentials=this.crossOrigin==="anonymous"?"same-origin":"include",o.headers=this.requestHeader,o.signal=typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal;const l=fetch(e,o).then(function(c){return c.blob()}).then(function(c){return createImageBitmap(c,Object.assign({},r.options,{colorSpaceConversion:"none"}))}).then(function(c){return Ni.add(`image-bitmap:${e}`,c),t&&t(c),r.manager.itemEnd(e),c}).catch(function(c){i&&i(c),sh.set(l,c),Ni.remove(`image-bitmap:${e}`),r.manager.itemError(e),r.manager.itemEnd(e)});Ni.add(`image-bitmap:${e}`,l),r.manager.itemStart(e)}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}}const er=-90,tr=1;class Rg extends Lt{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const i=new yn(er,tr,e,t);i.layers=this.layers,this.add(i);const r=new yn(er,tr,e,t);r.layers=this.layers,this.add(r);const a=new yn(er,tr,e,t);a.layers=this.layers,this.add(a);const o=new yn(er,tr,e,t);o.layers=this.layers,this.add(o);const l=new yn(er,tr,e,t);l.layers=this.layers,this.add(l);const c=new yn(er,tr,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){const e=this.coordinateSystem,t=this.children.concat(),[n,i,r,a,o,l]=t;for(const c of t)this.remove(c);if(e===ci)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(e===Ur)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(const c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());const[r,a,o,l,c,h]=this.children,d=e.getRenderTarget(),u=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),m=e.xr.enabled;e.xr.enabled=!1;const _=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let p=!1;e.isWebGLRenderer===!0?p=e.state.buffers.depth.getReversed():p=e.reversedDepthBuffer,e.setRenderTarget(n,0,i),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,r),e.setRenderTarget(n,1,i),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(n,2,i),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(n,3,i),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(n,4,i),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),n.texture.generateMipmaps=_,e.setRenderTarget(n,5,i),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,h),e.setRenderTarget(d,u,f),e.xr.enabled=m,n.texture.needsPMREMUpdate=!0}}class Pg extends yn{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}}class Ig{constructor(){this._previousTime=0,this._currentTime=0,this._startTime=performance.now(),this._delta=0,this._elapsed=0,this._timescale=1,this._document=null,this._pageVisibilityHandler=null}connect(e){this._document=e,e.hidden!==void 0&&(this._pageVisibilityHandler=Lg.bind(this),e.addEventListener("visibilitychange",this._pageVisibilityHandler,!1))}disconnect(){this._pageVisibilityHandler!==null&&(this._document.removeEventListener("visibilitychange",this._pageVisibilityHandler),this._pageVisibilityHandler=null),this._document=null}getDelta(){return this._delta/1e3}getElapsed(){return this._elapsed/1e3}getTimescale(){return this._timescale}setTimescale(e){return this._timescale=e,this}reset(){return this._currentTime=performance.now()-this._startTime,this}dispose(){this.disconnect()}update(e){return this._pageVisibilityHandler!==null&&this._document.hidden===!0?this._delta=0:(this._previousTime=this._currentTime,this._currentTime=(e!==void 0?e:performance.now())-this._startTime,this._delta=(this._currentTime-this._previousTime)*this._timescale,this._elapsed+=this._delta),this}}function Lg(){this._document.hidden===!1&&this.reset()}const rh="\\[\\]\\.:\\/",Dg=new RegExp("["+rh+"]","g"),ah="[^"+rh+"]",Ug="[^"+rh.replace("\\.","")+"]",Ng=/((?:WC+[\/:])*)/.source.replace("WC",ah),zg=/(WCOD+)?/.source.replace("WCOD",Ug),Fg=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",ah),Og=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",ah),Bg=new RegExp("^"+Ng+zg+Fg+Og+"$"),kg=["material","materials","bones","map"];class Vg{constructor(e,t,n){const i=n||bt.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,i)}getValue(e,t){this.bind();const n=this._targetGroup.nCachedObjects_,i=this._bindings[n];i!==void 0&&i.getValue(e,t)}setValue(e,t){const n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,r=n.length;i!==r;++i)n[i].setValue(e,t)}bind(){const e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){const e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}}class bt{constructor(e,t,n){this.path=t,this.parsedPath=n||bt.parseTrackName(t),this.node=bt.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){return e&&e.isAnimationObjectGroup?new bt.Composite(e,t,n):new bt(e,t,n)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(Dg,"")}static parseTrackName(e){const t=Bg.exec(e);if(t===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+e);const n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){const r=n.nodeName.substring(i+1);kg.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){const n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){const n=function(r){for(let a=0;a<r.length;a++){const o=r[a];if(o.name===t||o.uuid===t)return o;const l=n(o.children);if(l)return l}return null},i=n(e.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){const n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)e[t++]=n[i]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){const n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++]}_setValue_array_setNeedsUpdate(e,t){const n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){const n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node;const t=this.parsedPath,n=t.objectName,i=t.propertyName;let r=t.propertyIndex;if(e||(e=bt.findNode(this.rootNode,t.nodeName),this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){Fe("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=t.objectIndex;switch(n){case"materials":if(!e.material){He("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){He("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){He("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let h=0;h<e.length;h++)if(e[h].name===c){c=h;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material){He("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.map){He("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}e=e.material.map;break;default:if(e[n]===void 0){He("PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[n]}if(c!==void 0){if(e[c]===void 0){He("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[c]}}const a=e[i];if(a===void 0){const c=t.nodeName;He("PropertyBinding: Trying to update property for track: "+c+"."+i+" but it wasn't found.",e);return}let o=this.Versioning.None;this.targetObject=e,e.isMaterial===!0?o=this.Versioning.NeedsUpdate:e.isObject3D===!0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!e.geometry){He("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!e.geometry.morphAttributes){He("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}e.morphTargetDictionary[r]!==void 0&&(r=e.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=r}else a.fromArray!==void 0&&a.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(l=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=i;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}}bt.Composite=Vg,bt.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3},bt.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2},bt.prototype.GetterByBindingType=[bt.prototype._getValue_direct,bt.prototype._getValue_array,bt.prototype._getValue_arrayElement,bt.prototype._getValue_toArray],bt.prototype.SetterByBindingTypeAndVersioning=[[bt.prototype._setValue_direct,bt.prototype._setValue_direct_setNeedsUpdate,bt.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[bt.prototype._setValue_array,bt.prototype._setValue_array_setNeedsUpdate,bt.prototype._setValue_array_setMatrixWorldNeedsUpdate],[bt.prototype._setValue_arrayElement,bt.prototype._setValue_arrayElement_setNeedsUpdate,bt.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[bt.prototype._setValue_fromArray,bt.prototype._setValue_fromArray_setNeedsUpdate,bt.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];const hd=new De;class Hg{constructor(e,t,n=0,i=1/0){this.ray=new Gs(e,t),this.near=n,this.far=i,this.camera=null,this.layers=new xc,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(e,t){this.ray.set(e,t)}setFromCamera(e,t){t.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(e.x,e.y,.5).unproject(t).sub(this.ray.origin).normalize(),this.camera=t):t.isOrthographicCamera?(this.ray.origin.set(e.x,e.y,t.projectionMatrix.elements[14]).unproject(t),this.ray.direction.set(0,0,-1).transformDirection(t.matrixWorld),this.camera=t):He("Raycaster: Unsupported camera type: "+t.type)}setFromXRController(e){return hd.identity().extractRotation(e.matrixWorld),this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(hd),this}intersectObject(e,t=!0,n=[]){return oh(e,this,n,t),n.sort(ud),n}intersectObjects(e,t=!0,n=[]){for(let i=0,r=e.length;i<r;i++)oh(e[i],this,n,t);return n.sort(ud),n}}function ud(s,e){return s.distance-e.distance}function oh(s,e,t,n){let i=!0;if(s.layers.test(e.layers)&&s.raycast(e,t)===!1&&(i=!1),i===!0&&n===!0){const r=s.children;for(let a=0,o=r.length;a<o;a++)oh(r[a],e,t,!0)}}class fd{constructor(e=1,t=0,n=0){this.radius=e,this.phi=t,this.theta=n}set(e,t,n){return this.radius=e,this.phi=t,this.theta=n,this}copy(e){return this.radius=e.radius,this.phi=e.phi,this.theta=e.theta,this}makeSafe(){return this.phi=Je(this.phi,1e-6,Math.PI-1e-6),this}setFromVector3(e){return this.setFromCartesianCoords(e.x,e.y,e.z)}setFromCartesianCoords(e,t,n){return this.radius=Math.sqrt(e*e+t*t+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(e,n),this.phi=Math.acos(Je(t/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}}const mu=class mu{constructor(e,t,n,i){this.elements=[1,0,0,1],e!==void 0&&this.set(e,t,n,i)}identity(){return this.set(1,0,0,1),this}fromArray(e,t=0){for(let n=0;n<4;n++)this.elements[n]=e[n+t];return this}set(e,t,n,i){const r=this.elements;return r[0]=e,r[2]=t,r[1]=n,r[3]=i,this}};mu.prototype.isMatrix2=!0;let dd=mu;class Gg extends Gi{constructor(e,t=null){super(),this.object=e,this.domElement=t,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(e){this.domElement!==null&&this.disconnect(),this.domElement=e}disconnect(){}dispose(){}update(){}}function pd(s,e,t,n){const i=Wg(n);switch(t){case Pu:return s*e;case Na:return s*e/i.components*i.byteLength;case El:return s*e/i.components*i.byteLength;case is:return s*e*2/i.components*i.byteLength;case Cl:return s*e*2/i.components*i.byteLength;case Iu:return s*e*3/i.components*i.byteLength;case Cn:return s*e*4/i.components*i.byteLength;case Rl:return s*e*4/i.components*i.byteLength;case za:case Fa:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*8;case Oa:case Ba:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*16;case Il:case Dl:return Math.max(s,16)*Math.max(e,8)/4;case Pl:case Ll:return Math.max(s,8)*Math.max(e,8)/2;case Ul:case Nl:case Fl:case Ol:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*8;case zl:case ka:case Bl:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*16;case kl:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*16;case Vl:return Math.floor((s+4)/5)*Math.floor((e+3)/4)*16;case Hl:return Math.floor((s+4)/5)*Math.floor((e+4)/5)*16;case Gl:return Math.floor((s+5)/6)*Math.floor((e+4)/5)*16;case Wl:return Math.floor((s+5)/6)*Math.floor((e+5)/6)*16;case Xl:return Math.floor((s+7)/8)*Math.floor((e+4)/5)*16;case Yl:return Math.floor((s+7)/8)*Math.floor((e+5)/6)*16;case ql:return Math.floor((s+7)/8)*Math.floor((e+7)/8)*16;case Zl:return Math.floor((s+9)/10)*Math.floor((e+4)/5)*16;case $l:return Math.floor((s+9)/10)*Math.floor((e+5)/6)*16;case Kl:return Math.floor((s+9)/10)*Math.floor((e+7)/8)*16;case Jl:return Math.floor((s+9)/10)*Math.floor((e+9)/10)*16;case jl:return Math.floor((s+11)/12)*Math.floor((e+9)/10)*16;case Ql:return Math.floor((s+11)/12)*Math.floor((e+11)/12)*16;case ec:case tc:case nc:return Math.ceil(s/4)*Math.ceil(e/4)*16;case ic:case sc:return Math.ceil(s/4)*Math.ceil(e/4)*8;case Va:case rc:return Math.ceil(s/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Wg(s){switch(s){case vn:case Au:return{byteLength:1,components:1};case Pr:case Eu:case un:return{byteLength:2,components:1};case Tl:case Al:return{byteLength:2,components:4};case li:case bl:case On:return{byteLength:4,components:1};case Cu:case Ru:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${s}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"186"}})),typeof window<"u"&&(window.__THREE__?Fe("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="186");/**
 * @license
 * Copyright 2010-2026 Three.js Authors
 * SPDX-License-Identifier: MIT
 */function md(){let s=null,e=!1,t=null,n=null;function i(r,a){n=s.requestAnimationFrame(i),t(r,a)}return{start:function(){e!==!0&&t!==null&&s!==null&&(n=s.requestAnimationFrame(i),e=!0)},stop:function(){s!==null&&s.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){s=r}}}function Xg(s){const e=new WeakMap;function t(o,l){const c=o.array,h=o.usage,d=c.byteLength,u=s.createBuffer();s.bindBuffer(l,u),s.bufferData(l,c,h),o.onUploadCallback();let f;if(c instanceof Float32Array)f=s.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)f=s.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?f=s.HALF_FLOAT:f=s.UNSIGNED_SHORT;else if(c instanceof Int16Array)f=s.SHORT;else if(c instanceof Uint32Array)f=s.UNSIGNED_INT;else if(c instanceof Int32Array)f=s.INT;else if(c instanceof Int8Array)f=s.BYTE;else if(c instanceof Uint8Array)f=s.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)f=s.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:u,type:f,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:d}}function n(o,l,c){const h=l.array,d=l.updateRanges;if(s.bindBuffer(c,o),d.length===0)s.bufferSubData(c,0,h);else{d.sort((f,m)=>f.start-m.start);let u=0;for(let f=1;f<d.length;f++){const m=d[u],_=d[f];_.start<=m.start+m.count+1?m.count=Math.max(m.count,_.start+_.count-m.start):(++u,d[u]=_)}d.length=u+1;for(let f=0,m=d.length;f<m;f++){const _=d[f];s.bufferSubData(c,_.start*h.BYTES_PER_ELEMENT,h,_.start,_.count)}l.clearUpdateRanges()}l.onUploadCallback()}function i(o){return o.isInterleavedBufferAttribute&&(o=o.data),e.get(o)}function r(o){o.isInterleavedBufferAttribute&&(o=o.data);const l=e.get(o);l&&(s.deleteBuffer(l.buffer),e.delete(o))}function a(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){const h=e.get(o);(!h||h.version<o.version)&&e.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}const c=e.get(o);if(c===void 0)e.set(o,t(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,o,l),c.version=o.version}}return{get:i,remove:r,update:a}}var Yg=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,qg=`#ifdef USE_ALPHAHASH
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
#endif`,Zg=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,$g=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Kg=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Jg=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,jg=`#ifdef USE_AOMAP
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
#endif`,Qg=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,ex=`#ifdef USE_BATCHING
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
#endif`,tx=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,nx=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,ix=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,sx=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,rx=`#ifdef USE_IRIDESCENCE
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
#endif`,ax=`#ifdef USE_BUMPMAP
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
#endif`,ox=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,lx=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,cx=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,hx=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,ux=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,fx=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,dx=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,px=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
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
#endif`,mx=`#define PI 3.141592653589793
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
} // validated`,gx=`#ifdef ENVMAP_TYPE_CUBE_UV
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
#endif`,xx=`vec3 transformedNormal = objectNormal;
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
#endif`,vx=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,_x=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Mx=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,yx=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Sx="gl_FragColor = linearToOutputTexel( gl_FragColor );",wx=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,bx=`#ifdef USE_ENVMAP
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
#endif`,Tx=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,Ax=`#ifdef USE_ENVMAP
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
#endif`,Ex=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Cx=`#ifdef USE_ENVMAP
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
#endif`,Rx=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Px=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Ix=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Lx=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Dx=`#ifdef USE_GRADIENTMAP
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
}`,Ux=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Nx=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,zx=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Fx=`uniform bool receiveShadow;
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
#include <lightprobes_pars_fragment>`,Ox=`#ifdef USE_ENVMAP
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
#endif`,Bx=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,kx=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Vx=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Hx=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Gx=`PhysicalMaterial material;
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
#endif`,Wx=`uniform sampler2D dfgLUT;
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
}`,Xx=`
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
#endif`,Yx=`#if defined( RE_IndirectDiffuse )
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
#endif`,qx=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Zx=`#ifdef USE_LIGHT_PROBES_GRID
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
#endif`,$x=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Kx=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Jx=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,jx=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Qx=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,ev=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,tv=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,nv=`#if defined( USE_POINTS_UV )
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
#endif`,iv=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,sv=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,rv=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,av=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,ov=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,lv=`#ifdef USE_MORPHTARGETS
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
#endif`,cv=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,hv=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
vec3 nonPerturbedNormal = normal;`,uv=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
#endif`,fv=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,dv=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,pv=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,mv=`#ifdef USE_NORMALMAP
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
#endif`,gv=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,xv=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,vv=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,_v=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Mv=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,yv=`vec3 packNormalToRGB( const in vec3 normal ) {
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
}`,Sv=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,wv=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,bv=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Tv=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Av=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Ev=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,Cv=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,Rv=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,Pv=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
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
#endif`,Iv=`float getShadowMask() {
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
}`,Lv=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,Dv=`#ifdef USE_SKINNING
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
#endif`,Uv=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,Nv=`#ifdef USE_SKINNING
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
#endif`,zv=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Fv=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Ov=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Bv=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,kv=`#ifdef USE_TRANSMISSION
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
#endif`,Vv=`#ifdef USE_TRANSMISSION
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
#endif`,Hv=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Gv=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Wv=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Xv=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const Qe={alphahash_fragment:Yg,alphahash_pars_fragment:qg,alphamap_fragment:Zg,alphamap_pars_fragment:$g,alphatest_fragment:Kg,alphatest_pars_fragment:Jg,aomap_fragment:jg,aomap_pars_fragment:Qg,batching_pars_vertex:ex,batching_vertex:tx,begin_vertex:nx,beginnormal_vertex:ix,bsdfs:sx,iridescence_fragment:rx,bumpmap_pars_fragment:ax,clipping_planes_fragment:ox,clipping_planes_pars_fragment:lx,clipping_planes_pars_vertex:cx,clipping_planes_vertex:hx,color_fragment:ux,color_pars_fragment:fx,color_pars_vertex:dx,color_vertex:px,common:mx,cube_uv_reflection_fragment:gx,defaultnormal_vertex:xx,displacementmap_pars_vertex:vx,displacementmap_vertex:_x,emissivemap_fragment:Mx,emissivemap_pars_fragment:yx,colorspace_fragment:Sx,colorspace_pars_fragment:wx,envmap_fragment:bx,envmap_common_pars_fragment:Tx,envmap_pars_fragment:Ax,envmap_pars_vertex:Ex,envmap_physical_pars_fragment:Ox,envmap_vertex:Cx,fog_vertex:Rx,fog_pars_vertex:Px,fog_fragment:Ix,fog_pars_fragment:Lx,gradientmap_pars_fragment:Dx,lightmap_pars_fragment:Ux,lights_lambert_fragment:Nx,lights_lambert_pars_fragment:zx,lights_pars_begin:Fx,lights_toon_fragment:Bx,lights_toon_pars_fragment:kx,lights_phong_fragment:Vx,lights_phong_pars_fragment:Hx,lights_physical_fragment:Gx,lights_physical_pars_fragment:Wx,lights_fragment_begin:Xx,lights_fragment_maps:Yx,lights_fragment_end:qx,lightprobes_pars_fragment:Zx,logdepthbuf_fragment:$x,logdepthbuf_pars_fragment:Kx,logdepthbuf_pars_vertex:Jx,logdepthbuf_vertex:jx,map_fragment:Qx,map_pars_fragment:ev,map_particle_fragment:tv,map_particle_pars_fragment:nv,metalnessmap_fragment:iv,metalnessmap_pars_fragment:sv,morphinstance_vertex:rv,morphcolor_vertex:av,morphnormal_vertex:ov,morphtarget_pars_vertex:lv,morphtarget_vertex:cv,normal_fragment_begin:hv,normal_fragment_maps:uv,normal_pars_fragment:fv,normal_pars_vertex:dv,normal_vertex:pv,normalmap_pars_fragment:mv,clearcoat_normal_fragment_begin:gv,clearcoat_normal_fragment_maps:xv,clearcoat_pars_fragment:vv,iridescence_pars_fragment:_v,opaque_fragment:Mv,packing:yv,premultiplied_alpha_fragment:Sv,project_vertex:wv,dithering_fragment:bv,dithering_pars_fragment:Tv,roughnessmap_fragment:Av,roughnessmap_pars_fragment:Ev,shadowmap_pars_fragment:Cv,shadowmap_pars_vertex:Rv,shadowmap_vertex:Pv,shadowmask_pars_fragment:Iv,skinbase_vertex:Lv,skinning_pars_vertex:Dv,skinning_vertex:Uv,skinnormal_vertex:Nv,specularmap_fragment:zv,specularmap_pars_fragment:Fv,tonemapping_fragment:Ov,tonemapping_pars_fragment:Bv,transmission_fragment:kv,transmission_pars_fragment:Vv,uv_pars_fragment:Hv,uv_pars_vertex:Gv,uv_vertex:Wv,worldpos_vertex:Xv,background_vert:`varying vec2 vUv;
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
}`},Te={common:{diffuse:{value:new ge(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ze},alphaMap:{value:null},alphaMapTransform:{value:new Ze},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ze}},envmap:{envMap:{value:null},envMapRotation:{value:new Ze},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ze}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ze}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ze},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ze},normalScale:{value:new pe(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ze},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ze}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ze}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ze}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new ge(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new L},probesMax:{value:new L},probesResolution:{value:new L}},points:{diffuse:{value:new ge(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ze},alphaTest:{value:0},uvTransform:{value:new Ze}},sprite:{diffuse:{value:new ge(16777215)},opacity:{value:1},center:{value:new pe(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ze},alphaMap:{value:null},alphaMapTransform:{value:new Ze},alphaTest:{value:0}}},mi={basic:{uniforms:Mn([Te.common,Te.specularmap,Te.envmap,Te.aomap,Te.lightmap,Te.fog]),vertexShader:Qe.meshbasic_vert,fragmentShader:Qe.meshbasic_frag},lambert:{uniforms:Mn([Te.common,Te.specularmap,Te.envmap,Te.aomap,Te.lightmap,Te.emissivemap,Te.bumpmap,Te.normalmap,Te.displacementmap,Te.fog,Te.lights,{emissive:{value:new ge(0)},envMapIntensity:{value:1}}]),vertexShader:Qe.meshlambert_vert,fragmentShader:Qe.meshlambert_frag},phong:{uniforms:Mn([Te.common,Te.specularmap,Te.envmap,Te.aomap,Te.lightmap,Te.emissivemap,Te.bumpmap,Te.normalmap,Te.displacementmap,Te.fog,Te.lights,{emissive:{value:new ge(0)},specular:{value:new ge(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Qe.meshphong_vert,fragmentShader:Qe.meshphong_frag},standard:{uniforms:Mn([Te.common,Te.envmap,Te.aomap,Te.lightmap,Te.emissivemap,Te.bumpmap,Te.normalmap,Te.displacementmap,Te.roughnessmap,Te.metalnessmap,Te.fog,Te.lights,{emissive:{value:new ge(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Qe.meshphysical_vert,fragmentShader:Qe.meshphysical_frag},toon:{uniforms:Mn([Te.common,Te.aomap,Te.lightmap,Te.emissivemap,Te.bumpmap,Te.normalmap,Te.displacementmap,Te.gradientmap,Te.fog,Te.lights,{emissive:{value:new ge(0)}}]),vertexShader:Qe.meshtoon_vert,fragmentShader:Qe.meshtoon_frag},matcap:{uniforms:Mn([Te.common,Te.bumpmap,Te.normalmap,Te.displacementmap,Te.fog,{matcap:{value:null}}]),vertexShader:Qe.meshmatcap_vert,fragmentShader:Qe.meshmatcap_frag},points:{uniforms:Mn([Te.points,Te.fog]),vertexShader:Qe.points_vert,fragmentShader:Qe.points_frag},dashed:{uniforms:Mn([Te.common,Te.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Qe.linedashed_vert,fragmentShader:Qe.linedashed_frag},depth:{uniforms:Mn([Te.common,Te.displacementmap]),vertexShader:Qe.depth_vert,fragmentShader:Qe.depth_frag},normal:{uniforms:Mn([Te.common,Te.bumpmap,Te.normalmap,Te.displacementmap,{opacity:{value:1}}]),vertexShader:Qe.meshnormal_vert,fragmentShader:Qe.meshnormal_frag},sprite:{uniforms:Mn([Te.sprite,Te.fog]),vertexShader:Qe.sprite_vert,fragmentShader:Qe.sprite_frag},background:{uniforms:{uvTransform:{value:new Ze},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Qe.background_vert,fragmentShader:Qe.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ze}},vertexShader:Qe.backgroundCube_vert,fragmentShader:Qe.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Qe.cube_vert,fragmentShader:Qe.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Qe.equirect_vert,fragmentShader:Qe.equirect_frag},distance:{uniforms:Mn([Te.common,Te.displacementmap,{referencePosition:{value:new L},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Qe.distance_vert,fragmentShader:Qe.distance_frag},shadow:{uniforms:Mn([Te.lights,Te.fog,{color:{value:new ge(0)},opacity:{value:1}}]),vertexShader:Qe.shadow_vert,fragmentShader:Qe.shadow_frag}};mi.physical={uniforms:Mn([mi.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ze},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ze},clearcoatNormalScale:{value:new pe(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ze},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ze},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ze},sheen:{value:0},sheenColor:{value:new ge(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ze},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ze},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ze},transmissionSamplerSize:{value:new pe},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ze},attenuationDistance:{value:0},attenuationColor:{value:new ge(0)},specularColor:{value:new ge(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ze},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ze},anisotropyVector:{value:new pe},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ze}}]),vertexShader:Qe.meshphysical_vert,fragmentShader:Qe.meshphysical_frag};const Po={r:0,b:0,g:0},Yv=new De,gd=new Ze;gd.set(-1,0,0,0,1,0,0,0,1);function qv(s,e,t,n,i,r){const a=new ge(0);let o=i===!0?0:1,l,c,h=null,d=0,u=null;function f(v){let M=v.isScene===!0?v.background:null;if(M&&M.isTexture){const x=v.backgroundBlurriness>0;M=e.get(M,x)}return M}function m(v){let M=!1;const x=f(v);x===null?p(a,o):x&&x.isColor&&(p(x,1),M=!0);const w=s.xr.getEnvironmentBlendMode();w==="additive"?t.buffers.color.setClear(0,0,0,1,r):w==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,r),(s.autoClear||M)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),s.clear(s.autoClearColor,s.autoClearDepth,s.autoClearStencil))}function _(v,M){const x=f(M);x&&(x.isCubeTexture||x.mapping===La)?(c===void 0&&(c=new $e(new mt(1,1,1),new gt({name:"BackgroundCubeMaterial",uniforms:Zs(mi.backgroundCube.uniforms),vertexShader:mi.backgroundCube.vertexShader,fragmentShader:mi.backgroundCube.fragmentShader,side:xn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(w,S,A){this.matrixWorld.copyPosition(A.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),c.material.uniforms.envMap.value=x,c.material.uniforms.backgroundBlurriness.value=M.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=M.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(Yv.makeRotationFromEuler(M.backgroundRotation)).transpose(),x.isCubeTexture&&x.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(gd),c.material.toneMapped=st.getTransfer(x.colorSpace)!==_t,(h!==x||d!==x.version||u!==s.toneMapping)&&(c.material.needsUpdate=!0,h=x,d=x.version,u=s.toneMapping),c.layers.enableAll(),v.unshift(c,c.geometry,c.material,0,0,null)):x&&x.isTexture&&(l===void 0&&(l=new $e(new ni(2,2),new gt({name:"BackgroundMaterial",uniforms:Zs(mi.background.uniforms),vertexShader:mi.background.vertexShader,fragmentShader:mi.background.fragmentShader,side:ki,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=x,l.material.uniforms.backgroundIntensity.value=M.backgroundIntensity,l.material.toneMapped=st.getTransfer(x.colorSpace)!==_t,x.matrixAutoUpdate===!0&&x.updateMatrix(),l.material.uniforms.uvTransform.value.copy(x.matrix),(h!==x||d!==x.version||u!==s.toneMapping)&&(l.material.needsUpdate=!0,h=x,d=x.version,u=s.toneMapping),l.layers.enableAll(),v.unshift(l,l.geometry,l.material,0,0,null))}function p(v,M){v.getRGB(Po,$f(s)),t.buffers.color.setClear(Po.r,Po.g,Po.b,M,r)}function g(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(v,M=1){a.set(v),o=M,p(a,o)},getClearAlpha:function(){return o},setClearAlpha:function(v){o=v,p(a,o)},render:m,addToRenderList:_,dispose:g}}function Zv(s,e){const t=s.getParameter(s.MAX_VERTEX_ATTRIBS),n={},i=u(null);let r=i,a=!1;function o(P,D,U,R,B){let V=!1;const q=d(P,R,U,D);r!==q&&(r=q,c(r.object)),V=f(P,R,U,B),V&&m(P,R,U,B),B!==null&&e.update(B,s.ELEMENT_ARRAY_BUFFER),(V||a)&&(a=!1,x(P,D,U,R),B!==null&&s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,e.get(B).buffer))}function l(){return s.createVertexArray()}function c(P){return s.bindVertexArray(P)}function h(P){return s.deleteVertexArray(P)}function d(P,D,U,R){const B=R.wireframe===!0;let V=n[D.id];V===void 0&&(V={},n[D.id]=V);const q=P.isInstancedMesh===!0?P.id:0;let se=V[q];se===void 0&&(se={},V[q]=se);let $=se[U.id];$===void 0&&($={},se[U.id]=$);let ee=$[B];return ee===void 0&&(ee=u(l()),$[B]=ee),ee}function u(P){const D=[],U=[],R=[];for(let B=0;B<t;B++)D[B]=0,U[B]=0,R[B]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:D,enabledAttributes:U,attributeDivisors:R,object:P,attributes:{},index:null}}function f(P,D,U,R){const B=r.attributes,V=D.attributes;let q=0;const se=U.getAttributes();for(const $ in se)if(se[$].location>=0){const ue=B[$];let ve=V[$];if(ve===void 0&&($==="instanceMatrix"&&P.instanceMatrix&&(ve=P.instanceMatrix),$==="instanceColor"&&P.instanceColor&&(ve=P.instanceColor)),ue===void 0||ue.attribute!==ve||ve&&ue.data!==ve.data)return!0;q++}return r.attributesNum!==q||r.index!==R}function m(P,D,U,R){const B={},V=D.attributes;let q=0;const se=U.getAttributes();for(const $ in se)if(se[$].location>=0){let ue=V[$];ue===void 0&&($==="instanceMatrix"&&P.instanceMatrix&&(ue=P.instanceMatrix),$==="instanceColor"&&P.instanceColor&&(ue=P.instanceColor));const ve={};ve.attribute=ue,ue&&ue.data&&(ve.data=ue.data),B[$]=ve,q++}r.attributes=B,r.attributesNum=q,r.index=R}function _(){const P=r.newAttributes;for(let D=0,U=P.length;D<U;D++)P[D]=0}function p(P){g(P,0)}function g(P,D){const U=r.newAttributes,R=r.enabledAttributes,B=r.attributeDivisors;U[P]=1,R[P]===0&&(s.enableVertexAttribArray(P),R[P]=1),B[P]!==D&&(s.vertexAttribDivisor(P,D),B[P]=D)}function v(){const P=r.newAttributes,D=r.enabledAttributes;for(let U=0,R=D.length;U<R;U++)D[U]!==P[U]&&(s.disableVertexAttribArray(U),D[U]=0)}function M(P,D,U,R,B,V,q){q===!0?s.vertexAttribIPointer(P,D,U,B,V):s.vertexAttribPointer(P,D,U,R,B,V)}function x(P,D,U,R){_();const B=R.attributes,V=U.getAttributes(),q=D.defaultAttributeValues;for(const se in V){const $=V[se];if($.location>=0){let ee=B[se];if(ee===void 0&&(se==="instanceMatrix"&&P.instanceMatrix&&(ee=P.instanceMatrix),se==="instanceColor"&&P.instanceColor&&(ee=P.instanceColor)),ee!==void 0){const ue=ee.normalized,ve=ee.itemSize,Me=e.get(ee);if(Me===void 0)continue;const Xe=Me.buffer,Oe=Me.type,Ue=Me.bytesPerElement,re=Oe===s.INT||Oe===s.UNSIGNED_INT||ee.gpuType===bl;if(ee.isInterleavedBufferAttribute){const le=ee.data,ye=le.stride,Ne=ee.offset;if(le.isInstancedInterleavedBuffer){for(let we=0;we<$.locationSize;we++)g($.location+we,le.meshPerAttribute);P.isInstancedMesh!==!0&&R._maxInstanceCount===void 0&&(R._maxInstanceCount=le.meshPerAttribute*le.count)}else for(let we=0;we<$.locationSize;we++)p($.location+we);s.bindBuffer(s.ARRAY_BUFFER,Xe);for(let we=0;we<$.locationSize;we++)M($.location+we,ve/$.locationSize,Oe,ue,ye*Ue,(Ne+ve/$.locationSize*we)*Ue,re)}else{if(ee.isInstancedBufferAttribute){for(let le=0;le<$.locationSize;le++)g($.location+le,ee.meshPerAttribute);P.isInstancedMesh!==!0&&R._maxInstanceCount===void 0&&(R._maxInstanceCount=ee.meshPerAttribute*ee.count)}else for(let le=0;le<$.locationSize;le++)p($.location+le);s.bindBuffer(s.ARRAY_BUFFER,Xe);for(let le=0;le<$.locationSize;le++)M($.location+le,ve/$.locationSize,Oe,ue,ve*Ue,ve/$.locationSize*le*Ue,re)}}else if(q!==void 0){const ue=q[se];if(ue!==void 0)switch(ue.length){case 2:s.vertexAttrib2fv($.location,ue);break;case 3:s.vertexAttrib3fv($.location,ue);break;case 4:s.vertexAttrib4fv($.location,ue);break;default:s.vertexAttrib1fv($.location,ue)}}}}v()}function w(){T();for(const P in n){const D=n[P];for(const U in D){const R=D[U];for(const B in R){const V=R[B];for(const q in V)h(V[q].object),delete V[q];delete R[B]}}delete n[P]}}function S(P){if(n[P.id]===void 0)return;const D=n[P.id];for(const U in D){const R=D[U];for(const B in R){const V=R[B];for(const q in V)h(V[q].object),delete V[q];delete R[B]}}delete n[P.id]}function A(P){for(const D in n){const U=n[D];for(const R in U){const B=U[R];if(B[P.id]===void 0)continue;const V=B[P.id];for(const q in V)h(V[q].object),delete V[q];delete B[P.id]}}}function y(P){for(const D in n){const U=n[D],R=P.isInstancedMesh===!0?P.id:0,B=U[R];if(B!==void 0){for(const V in B){const q=B[V];for(const se in q)h(q[se].object),delete q[se];delete B[V]}delete U[R],Object.keys(U).length===0&&delete n[D]}}}function T(){C(),a=!0,r!==i&&(r=i,c(r.object))}function C(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:o,reset:T,resetDefaultState:C,dispose:w,releaseStatesOfGeometry:S,releaseStatesOfObject:y,releaseStatesOfProgram:A,initAttributes:_,enableAttribute:p,disableUnusedAttributes:v}}function $v(s,e,t){let n;function i(l){n=l}function r(l,c){s.drawArrays(n,l,c),t.update(c,n,1)}function a(l,c,h){h!==0&&(s.drawArraysInstanced(n,l,c,h),t.update(c,n,h))}function o(l,c,h){if(h===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,c,0,h);let u=0;for(let f=0;f<h;f++)u+=c[f];t.update(u,n,1)}this.setMode=i,this.render=r,this.renderInstances=a,this.renderMultiDraw=o}function Kv(s,e,t,n){let i;function r(){if(i!==void 0)return i;if(e.has("EXT_texture_filter_anisotropic")===!0){const A=e.get("EXT_texture_filter_anisotropic");i=s.getParameter(A.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function a(A){return!(A!==Cn&&n.convert(A)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(A){const y=A===un&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(A!==vn&&A!==On&&!y&&n.convert(A)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_TYPE))}function l(A){if(A==="highp"){if(s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.HIGH_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.HIGH_FLOAT).precision>0)return"highp";A="mediump"}return A==="mediump"&&s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.MEDIUM_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=t.precision!==void 0?t.precision:"highp";const h=l(c);h!==c&&(Fe("WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);const d=t.logarithmicDepthBuffer===!0,u=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control");t.reversedDepthBuffer===!0&&u===!1&&Fe("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");const f=s.getParameter(s.MAX_TEXTURE_IMAGE_UNITS),m=s.getParameter(s.MAX_VERTEX_TEXTURE_IMAGE_UNITS),_=s.getParameter(s.MAX_TEXTURE_SIZE),p=s.getParameter(s.MAX_CUBE_MAP_TEXTURE_SIZE),g=s.getParameter(s.MAX_VERTEX_ATTRIBS),v=s.getParameter(s.MAX_VERTEX_UNIFORM_VECTORS),M=s.getParameter(s.MAX_VARYING_VECTORS),x=s.getParameter(s.MAX_FRAGMENT_UNIFORM_VECTORS),w=s.getParameter(s.MAX_SAMPLES),S=s.getParameter(s.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:a,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:d,reversedDepthBuffer:u,maxTextures:f,maxVertexTextures:m,maxTextureSize:_,maxCubemapSize:p,maxAttributes:g,maxVertexUniforms:v,maxVaryings:M,maxFragmentUniforms:x,maxSamples:w,samples:S}}function Jv(s){const e=this;let t=null,n=0,i=!1,r=!1;const a=new ui,o=new Ze,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(d,u){const f=d.length!==0||u||n!==0||i;return i=u,n=d.length,f},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(d,u){t=h(d,u,0)},this.setState=function(d,u,f){const m=d.clippingPlanes,_=d.clipIntersection,p=d.clipShadows,g=s.get(d);if(!i||m===null||m.length===0||r&&!p)r?h(null):c();else{const v=r?0:n,M=v*4;let x=g.clippingState||null;l.value=x,x=h(m,u,M,f);for(let w=0;w!==M;++w)x[w]=t[w];g.clippingState=x,this.numIntersection=_?this.numPlanes:0,this.numPlanes+=v}};function c(){l.value!==t&&(l.value=t,l.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function h(d,u,f,m){const _=d!==null?d.length:0;let p=null;if(_!==0){if(p=l.value,m!==!0||p===null){const g=f+_*4,v=u.matrixWorldInverse;o.getNormalMatrix(v),(p===null||p.length<g)&&(p=new Float32Array(g));for(let M=0,x=f;M!==_;++M,x+=4)a.copy(d[M]).applyMatrix4(v,o),a.normal.toArray(p,x),p[x+3]=a.constant}l.value=p,l.needsUpdate=!0}return e.numPlanes=_,e.numIntersection=0,p}}const nr=4,jv=6,Qv=20,e_=256,da=new ua,xd=new ge;let lh=null,ch=0,hh=0,uh=!1;const t_=new L,hs=new L;class vd{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,i=100,r={}){const{size:a=256,position:o=t_}=r;lh=this._renderer.getRenderTarget(),ch=this._renderer.getActiveCubeFace(),hh=this._renderer.getActiveMipmapLevel(),uh=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(e,n,i,l,o),t>0&&this._blur(l,0,0,t),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=yd(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Md(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(lh,ch,hh),this._renderer.xr.enabled=uh,e.scissorTest=!1,ir(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===ns||e.mapping===bs?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),lh=this._renderer.getRenderTarget(),ch=this._renderer.getActiveCubeFace(),hh=this._renderer.getActiveMipmapLevel(),uh=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:Gt,minFilter:Gt,generateMipmaps:!1,type:un,format:Cn,colorSpace:Rn,depthBuffer:!1},i=_d(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=_d(e,t,n);const{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods}=n_(r)),this._blurMaterial=s_(r,e,t),this._ggxMaterial=i_(r,e,t)}return i}_compileMaterial(e){const t=new $e(new At,e);this._renderer.compile(t,da)}_sceneToCubeUV(e,t,n,i,r){const l=new yn(90,1,t,n),c=[1,-1,1,1,1,1],h=[1,1,1,-1,-1,-1],d=this._renderer,u=d.autoClear,f=d.toneMapping;d.getClearColor(xd),d.toneMapping=oi,d.autoClear=!1,d.state.buffers.depth.getReversed()&&(d.setRenderTarget(i),d.clearDepth(),d.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new $e(new mt,new Dt({name:"PMREM.Background",side:xn,depthWrite:!1,depthTest:!1})));const _=this._backgroundBox,p=_.material;let g=!1;const v=e.background;v?v.isColor&&(p.color.copy(v),e.background=null,g=!0):(p.color.copy(xd),g=!0);for(let M=0;M<6;M++){const x=M%3;x===0?(l.up.set(0,c[M],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x+h[M],r.y,r.z)):x===1?(l.up.set(0,0,c[M]),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y+h[M],r.z)):(l.up.set(0,c[M],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y,r.z+h[M]));const w=this._cubeSize;ir(i,x*w,M>2?w:0,w,w),d.setRenderTarget(i),g&&d.render(_,l),d.render(e,l)}d.toneMapping=f,d.autoClear=u,e.background=v}_textureToCubeUV(e,t){const n=this._renderer,i=e.mapping===ns||e.mapping===bs;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=yd()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Md());const r=i?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=r;const o=r.uniforms;o.envMap.value=e;const l=this._cubeSize;ir(t,0,0,3*l,2*l),n.setRenderTarget(t),n.render(a,da)}_applyPMREM(e){const t=this._renderer,n=t.autoClear;t.autoClear=!1;const i=this._lodMeshes.length;for(let r=1;r<i;r++)this._applyGGXFilter(e,r-1,r);t.autoClear=n}_applyGGXFilter(e,t,n){const i=this._renderer,r=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;const l=a.uniforms,c=n/(this._lodMeshes.length-1),h=t/(this._lodMeshes.length-1),d=Math.sqrt(c*c-h*h),u=c*1.25,f=d*u,{_lodMax:m}=this,_=this._sizeLods[n],p=3*_*(n>m-nr?n-m+nr:0),g=4*(this._cubeSize-_);l.envMap.value=e.texture,l.roughness.value=f,l.mipInt.value=m-t,ir(r,p,g,3*_,2*_),i.setRenderTarget(r),i.render(o,da),l.envMap.value=r.texture,l.roughness.value=0,l.mipInt.value=m-n,ir(e,p,g,3*_,2*_),i.setRenderTarget(e),i.render(o,da)}_blur(e,t,n,i){const r=this._pingPongRenderTarget,a=Math.min(i,Math.PI)/Math.SQRT2;this._blurPass(e,r,t,n,a),this._blurPass(r,e,n,n,a)}_blurPass(e,t,n,i,r){const a=this._renderer,o=this._blurMaterial,l=this._lodMeshes[i];l.material=o;const c=o.uniforms;c.envMap.value=e.texture,c.sigma.value=r,c.mipInt.value=this._lodMax-n;const h=this._sizeLods[i],d=3*h*(i>this._lodMax-nr?i-this._lodMax+nr:0),u=4*(this._cubeSize-h);ir(t,d,u,3*h,2*h),a.setRenderTarget(t),a.render(l,da)}}function n_(s){const e=[],t=[];let n=s;const i=s-nr+1+jv;for(let r=0;r<i;r++){const a=Math.pow(2,n);e.push(a);const o=1/(a-2),l=-o,c=1+o,h=[l,l,c,l,c,c,l,l,c,c,l,c],d=6,u=6,f=3,m=new Float32Array(f*u*d),_=new Float32Array(f*u*d);for(let g=0;g<d;g++){const v=g%3*2/3-1,M=g>2?0:-1,x=[v,M,0,v+2/3,M,0,v+2/3,M+1,0,v,M,0,v+2/3,M+1,0,v,M+1,0];m.set(x,f*u*g);for(let w=0;w<u;w++){const S=h[w*2]*2-1,A=h[w*2+1]*2-1;g===0?hs.set(1,A,S):g===1?hs.set(-S,1,-A):g===2?hs.set(-S,A,1):g===3?hs.set(-1,A,-S):g===4?hs.set(-S,-1,A):hs.set(S,A,-1),hs.toArray(_,(g*u+w)*f)}}const p=new At;p.setAttribute("position",new Ot(m,f)),p.setAttribute("outputDirection",new Ot(_,f)),t.push(new $e(p,null)),n>nr&&n--}return{lodMeshes:t,sizeLods:e}}function _d(s,e,t){const n=new on(s,e,t);return n.texture.mapping=La,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function ir(s,e,t,n,i){s.viewport.set(e,t,n,i),s.scissor.set(e,t,n,i)}function i_(s,e,t){return new gt({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:e_,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Io(),fragmentShader:`

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
		`,blending:an,depthTest:!1,depthWrite:!1})}function s_(s,e,t){return new gt({name:"SphericalGaussianBlur",defines:{SAMPLES:Qv,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},sigma:{value:0},mipInt:{value:0}},vertexShader:Io(),fragmentShader:`

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
		`,blending:an,depthTest:!1,depthWrite:!1})}function Md(){return new gt({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Io(),fragmentShader:`

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
		`,blending:an,depthTest:!1,depthWrite:!1})}function yd(){return new gt({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Io(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:an,depthTest:!1,depthWrite:!1})}function Io(){return`

		precision mediump float;
		precision mediump int;

		attribute vec3 outputDirection;

		varying vec3 vOutputDirection;

		void main() {

			vOutputDirection = outputDirection;
			gl_Position = vec4( position, 1.0 );

		}
	`}class Sd extends on{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;const n={width:e,height:e,depth:1},i=[n,n,n,n,n,n];this.texture=new Rf(i),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},i=new mt(5,5,5),r=new gt({name:"CubemapFromEquirect",uniforms:Zs(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:xn,blending:an});r.uniforms.tEquirect.value=t;const a=new $e(i,r),o=t.minFilter;return t.minFilter===Ti&&(t.minFilter=Gt),new Rg(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,i=!0){const r=e.getRenderTarget();for(let a=0;a<6;a++)e.setRenderTarget(this,a),e.clear(t,n,i);e.setRenderTarget(r)}}function r_(s){let e=new WeakMap,t=new WeakMap,n=null;function i(u,f=!1){return u==null?null:f?a(u):r(u)}function r(u){if(u&&u.isTexture){const f=u.mapping;if(f===Ia||f===wl)if(e.has(u)){const m=e.get(u).texture;return o(m,u.mapping)}else{const m=u.image;if(m&&m.height>0){const _=new Sd(m.height);return _.fromEquirectangularTexture(s,u),e.set(u,_),u.addEventListener("dispose",c),o(_.texture,u.mapping)}else return null}}return u}function a(u){if(u&&u.isTexture){const f=u.mapping,m=f===Ia||f===wl,_=f===ns||f===bs;if(m||_){let p=t.get(u);const g=p!==void 0?p.texture.pmremVersion:0;if(u.isRenderTargetTexture&&u.pmremVersion!==g)return n===null&&(n=new vd(s)),p=m?n.fromEquirectangular(u,p):n.fromCubemap(u,p),p.texture.pmremVersion=u.pmremVersion,t.set(u,p),p.texture;if(p!==void 0)return p.texture;{const v=u.image;return m&&v&&v.height>0||_&&v&&l(v)?(n===null&&(n=new vd(s)),p=m?n.fromEquirectangular(u):n.fromCubemap(u),p.texture.pmremVersion=u.pmremVersion,t.set(u,p),u.addEventListener("dispose",h),p.texture):null}}}return u}function o(u,f){return f===Ia?u.mapping=ns:f===wl&&(u.mapping=bs),u}function l(u){let f=0;const m=6;for(let _=0;_<m;_++)u[_]!==void 0&&f++;return f===m}function c(u){const f=u.target;f.removeEventListener("dispose",c);const m=e.get(f);m!==void 0&&(e.delete(f),m.dispose())}function h(u){const f=u.target;f.removeEventListener("dispose",h);const m=t.get(f);m!==void 0&&(t.delete(f),m.dispose())}function d(){e=new WeakMap,t=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:i,dispose:d}}function a_(s){const e={};function t(n){if(e[n]!==void 0)return e[n];const i=s.getExtension(n);return e[n]=i,i}return{has:function(n){return t(n)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(n){const i=t(n);return i===null&&As("WebGLRenderer: "+n+" extension not supported."),i}}}function o_(s,e,t,n){const i={},r=new WeakMap;function a(d){const u=d.target;u.index!==null&&e.remove(u.index);for(const m in u.attributes)e.remove(u.attributes[m]);u.removeEventListener("dispose",a),delete i[u.id];const f=r.get(u);f&&(e.remove(f),r.delete(u)),n.releaseStatesOfGeometry(u),u.isInstancedBufferGeometry===!0&&delete u._maxInstanceCount,t.memory.geometries--}function o(d,u){return i[u.id]===!0||(u.addEventListener("dispose",a),i[u.id]=!0,t.memory.geometries++),u}function l(d){const u=d.attributes;for(const f in u)e.update(u[f],s.ARRAY_BUFFER)}function c(d){const u=[],f=d.index,m=d.attributes.position;let _=0;if(m===void 0)return;if(f!==null){const v=f.array;_=f.version;for(let M=0,x=v.length;M<x;M+=3){const w=v[M+0],S=v[M+1],A=v[M+2];u.push(w,S,S,A,A,w)}}else{const v=m.array;_=m.version;for(let M=0,x=v.length/3-1;M<x;M+=3){const w=M+0,S=M+1,A=M+2;u.push(w,S,S,A,A,w)}}const p=new(m.count>=65535?nf:tf)(u,1);p.version=_;const g=r.get(d);g&&e.remove(g),r.set(d,p)}function h(d){const u=r.get(d);if(u){const f=d.index;f!==null&&u.version<f.version&&c(d)}else c(d);return r.get(d)}return{get:o,update:l,getWireframeAttribute:h}}function l_(s,e,t){let n;function i(d){n=d}let r,a;function o(d){r=d.type,a=d.bytesPerElement}function l(d,u){s.drawElements(n,u,r,d*a),t.update(u,n,1)}function c(d,u,f){f!==0&&(s.drawElementsInstanced(n,u,r,d*a,f),t.update(u,n,f))}function h(d,u,f){if(f===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,u,0,r,d,0,f);let _=0;for(let p=0;p<f;p++)_+=u[p];t.update(_,n,1)}this.setMode=i,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=h}function c_(s){const e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,a,o){switch(t.calls++,a){case s.TRIANGLES:t.triangles+=o*(r/3);break;case s.LINES:t.lines+=o*(r/2);break;case s.LINE_STRIP:t.lines+=o*(r-1);break;case s.LINE_LOOP:t.lines+=o*r;break;case s.POINTS:t.points+=o*r;break;default:He("WebGLInfo: Unknown draw mode:",a);break}}function i(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:i,update:n}}function h_(s,e,t){const n=new WeakMap,i=new Mt;function r(a,o,l){const c=a.morphTargetInfluences,h=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,d=h!==void 0?h.length:0;let u=n.get(o);if(u===void 0||u.count!==d){let T=function(){A.dispose(),n.delete(o),o.removeEventListener("dispose",T)};u!==void 0&&u.texture.dispose();const f=o.morphAttributes.position!==void 0,m=o.morphAttributes.normal!==void 0,_=o.morphAttributes.color!==void 0,p=o.morphAttributes.position||[],g=o.morphAttributes.normal||[],v=o.morphAttributes.color||[];let M=0;f===!0&&(M=1),m===!0&&(M=2),_===!0&&(M=3);let x=o.attributes.position.count*M,w=1;x>e.maxTextureSize&&(w=Math.ceil(x/e.maxTextureSize),x=e.maxTextureSize);const S=new Float32Array(x*w*4*d),A=new Xu(S,x,w,d);A.type=On,A.needsUpdate=!0;const y=M*4;for(let C=0;C<d;C++){const P=p[C],D=g[C],U=v[C],R=x*w*4*C;for(let B=0;B<P.count;B++){const V=B*y;f===!0&&(i.fromBufferAttribute(P,B),S[R+V+0]=i.x,S[R+V+1]=i.y,S[R+V+2]=i.z,S[R+V+3]=0),m===!0&&(i.fromBufferAttribute(D,B),S[R+V+4]=i.x,S[R+V+5]=i.y,S[R+V+6]=i.z,S[R+V+7]=0),_===!0&&(i.fromBufferAttribute(U,B),S[R+V+8]=i.x,S[R+V+9]=i.y,S[R+V+10]=i.z,S[R+V+11]=U.itemSize===4?i.w:1)}}u={count:d,texture:A,size:new pe(x,w)},n.set(o,u),o.addEventListener("dispose",T)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)l.getUniforms().setValue(s,"morphTexture",a.morphTexture,t);else{let f=0;for(let _=0;_<c.length;_++)f+=c[_];const m=o.morphTargetsRelative?1:1-f;l.getUniforms().setValue(s,"morphTargetBaseInfluence",m),l.getUniforms().setValue(s,"morphTargetInfluences",c)}l.getUniforms().setValue(s,"morphTargetsTexture",u.texture,t),l.getUniforms().setValue(s,"morphTargetsTextureSize",u.size)}return{update:r}}function u_(s,e,t,n,i){let r=new WeakMap;function a(c){const h=i.render.frame,d=c.geometry,u=e.get(c,d);if(r.get(u)!==h&&(e.update(u),r.set(u,h)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),r.get(c)!==h&&(t.update(c.instanceMatrix,s.ARRAY_BUFFER),c.instanceColor!==null&&t.update(c.instanceColor,s.ARRAY_BUFFER),r.set(c,h))),c.isSkinnedMesh){const f=c.skeleton;r.get(f)!==h&&(f.update(),r.set(f,h))}return u}function o(){r=new WeakMap}function l(c){const h=c.target;h.removeEventListener("dispose",l),n.releaseStatesOfObject(h),t.remove(h.instanceMatrix),h.instanceColor!==null&&t.remove(h.instanceColor)}return{update:a,dispose:o}}const f_={[xl]:"LINEAR_TONE_MAPPING",[vl]:"REINHARD_TONE_MAPPING",[_l]:"CINEON_TONE_MAPPING",[Pa]:"ACES_FILMIC_TONE_MAPPING",[yl]:"AGX_TONE_MAPPING",[Sl]:"NEUTRAL_TONE_MAPPING",[Ml]:"CUSTOM_TONE_MAPPING"};function d_(s,e,t,n,i,r){const a=new on(e,t,{type:s,depthBuffer:i,stencilBuffer:r,samples:n?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1});let o=null,l=null;const c=new At;c.setAttribute("position",new je([-1,3,0,-1,-1,0,3,-1,0],3)),c.setAttribute("uv",new je([0,2,0,0,2,0],2));const h=new Kf({uniforms:{tDiffuse:{value:null}},vertexShader:`
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
			}`,depthTest:!1,depthWrite:!1}),d=new $e(c,h),u=new ua(-1,1,1,-1,0,1);let f=null,m=null,_=!1,p,g=null,v=[],M=!1;this.setSize=function(x,w){a.setSize(x,w),o!==null&&o.setSize(x,w),l!==null&&l.setSize(x,w);for(let S=0;S<v.length;S++){const A=v[S];A.setSize&&A.setSize(x,w)}},this.setEffects=function(x){v=x,M=v.length>0&&v[0].isRenderPass===!0;const w=a.width,S=a.height;v.length>0&&o===null&&(o=new on(w,S,{type:un,depthBuffer:!1,stencilBuffer:!1}),l=new on(w,S,{type:un,depthBuffer:!1,stencilBuffer:!1}));for(let A=0;A<v.length;A++){const y=v[A];y.setSize&&y.setSize(w,S)}},this.begin=function(x,w){if(_||x.toneMapping===oi&&v.length===0)return!1;if(g=w,w!==null){const S=w.width,A=w.height;(a.width!==S||a.height!==A)&&this.setSize(S,A)}return M===!1&&x.setRenderTarget(a),p=x.toneMapping,x.toneMapping=oi,!0},this.hasRenderPass=function(){return M},this.end=function(x,w){x.toneMapping=p,_=!0;let S=a,A=o;for(let y=0;y<v.length;y++){const T=v[y];T.enabled!==!1&&(T.render(x,A,S,w),T.needsSwap!==!1&&(S=A,A=A===o?l:o))}if(f!==x.outputColorSpace||m!==x.toneMapping){f=x.outputColorSpace,m=x.toneMapping,h.defines={},st.getTransfer(f)===_t&&(h.defines.SRGB_TRANSFER="");const y=f_[m];y&&(h.defines[y]=""),h.needsUpdate=!0}h.uniforms.tDiffuse.value=S.texture,x.setRenderTarget(g),x.render(d,u),g=null,_=!1},this.isCompositing=function(){return _},this.dispose=function(){a.dispose(),o!==null&&o.dispose(),l!==null&&l.dispose(),c.dispose(),h.dispose()}}const wd=new Ft,fh=new Ys(1,1),bd=new Xu,Td=new e0,Ad=new Rf,Ed=[],Cd=[],Rd=new Float32Array(16),Pd=new Float32Array(9),Id=new Float32Array(4);function sr(s,e,t){const n=s[0];if(n<=0||n>0)return s;const i=e*t;let r=Ed[i];if(r===void 0&&(r=new Float32Array(i),Ed[i]=r),e!==0){n.toArray(r,0);for(let a=1,o=0;a!==e;++a)o+=t,s[a].toArray(r,o)}return r}function jt(s,e){if(s.length!==e.length)return!1;for(let t=0,n=s.length;t<n;t++)if(s[t]!==e[t])return!1;return!0}function Qt(s,e){for(let t=0,n=e.length;t<n;t++)s[t]=e[t]}function Lo(s,e){let t=Cd[e];t===void 0&&(t=new Int32Array(e),Cd[e]=t);for(let n=0;n!==e;++n)t[n]=s.allocateTextureUnit();return t}function p_(s,e){const t=this.cache;t[0]!==e&&(s.uniform1f(this.addr,e),t[0]=e)}function m_(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(jt(t,e))return;s.uniform2fv(this.addr,e),Qt(t,e)}}function g_(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(s.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(jt(t,e))return;s.uniform3fv(this.addr,e),Qt(t,e)}}function x_(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(jt(t,e))return;s.uniform4fv(this.addr,e),Qt(t,e)}}function v_(s,e){const t=this.cache,n=e.elements;if(n===void 0){if(jt(t,e))return;s.uniformMatrix2fv(this.addr,!1,e),Qt(t,e)}else{if(jt(t,n))return;Id.set(n),s.uniformMatrix2fv(this.addr,!1,Id),Qt(t,n)}}function __(s,e){const t=this.cache,n=e.elements;if(n===void 0){if(jt(t,e))return;s.uniformMatrix3fv(this.addr,!1,e),Qt(t,e)}else{if(jt(t,n))return;Pd.set(n),s.uniformMatrix3fv(this.addr,!1,Pd),Qt(t,n)}}function M_(s,e){const t=this.cache,n=e.elements;if(n===void 0){if(jt(t,e))return;s.uniformMatrix4fv(this.addr,!1,e),Qt(t,e)}else{if(jt(t,n))return;Rd.set(n),s.uniformMatrix4fv(this.addr,!1,Rd),Qt(t,n)}}function y_(s,e){const t=this.cache;t[0]!==e&&(s.uniform1i(this.addr,e),t[0]=e)}function S_(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(jt(t,e))return;s.uniform2iv(this.addr,e),Qt(t,e)}}function w_(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(jt(t,e))return;s.uniform3iv(this.addr,e),Qt(t,e)}}function b_(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(jt(t,e))return;s.uniform4iv(this.addr,e),Qt(t,e)}}function T_(s,e){const t=this.cache;t[0]!==e&&(s.uniform1ui(this.addr,e),t[0]=e)}function A_(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(jt(t,e))return;s.uniform2uiv(this.addr,e),Qt(t,e)}}function E_(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(jt(t,e))return;s.uniform3uiv(this.addr,e),Qt(t,e)}}function C_(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(jt(t,e))return;s.uniform4uiv(this.addr,e),Qt(t,e)}}function R_(s,e,t){const n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i);let r;this.type===s.SAMPLER_2D_SHADOW?(fh.compareFunction=t.isReversedDepthBuffer()?hc:cc,r=fh):r=wd,t.setTexture2D(e||r,i)}function P_(s,e,t){const n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTexture3D(e||Td,i)}function I_(s,e,t){const n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTextureCube(e||Ad,i)}function L_(s,e,t){const n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTexture2DArray(e||bd,i)}function D_(s){switch(s){case 5126:return p_;case 35664:return m_;case 35665:return g_;case 35666:return x_;case 35674:return v_;case 35675:return __;case 35676:return M_;case 5124:case 35670:return y_;case 35667:case 35671:return S_;case 35668:case 35672:return w_;case 35669:case 35673:return b_;case 5125:return T_;case 36294:return A_;case 36295:return E_;case 36296:return C_;case 35678:case 36198:case 36298:case 36306:case 35682:return R_;case 35679:case 36299:case 36307:return P_;case 35680:case 36300:case 36308:case 36293:return I_;case 36289:case 36303:case 36311:case 36292:return L_}}function U_(s,e){s.uniform1fv(this.addr,e)}function N_(s,e){const t=sr(e,this.size,2);s.uniform2fv(this.addr,t)}function z_(s,e){const t=sr(e,this.size,3);s.uniform3fv(this.addr,t)}function F_(s,e){const t=sr(e,this.size,4);s.uniform4fv(this.addr,t)}function O_(s,e){const t=sr(e,this.size,4);s.uniformMatrix2fv(this.addr,!1,t)}function B_(s,e){const t=sr(e,this.size,9);s.uniformMatrix3fv(this.addr,!1,t)}function k_(s,e){const t=sr(e,this.size,16);s.uniformMatrix4fv(this.addr,!1,t)}function V_(s,e){s.uniform1iv(this.addr,e)}function H_(s,e){s.uniform2iv(this.addr,e)}function G_(s,e){s.uniform3iv(this.addr,e)}function W_(s,e){s.uniform4iv(this.addr,e)}function X_(s,e){s.uniform1uiv(this.addr,e)}function Y_(s,e){s.uniform2uiv(this.addr,e)}function q_(s,e){s.uniform3uiv(this.addr,e)}function Z_(s,e){s.uniform4uiv(this.addr,e)}function $_(s,e,t){const n=this.cache,i=e.length,r=Lo(t,i);jt(n,r)||(s.uniform1iv(this.addr,r),Qt(n,r));let a;this.type===s.SAMPLER_2D_SHADOW?a=fh:a=wd;for(let o=0;o!==i;++o)t.setTexture2D(e[o]||a,r[o])}function K_(s,e,t){const n=this.cache,i=e.length,r=Lo(t,i);jt(n,r)||(s.uniform1iv(this.addr,r),Qt(n,r));for(let a=0;a!==i;++a)t.setTexture3D(e[a]||Td,r[a])}function J_(s,e,t){const n=this.cache,i=e.length,r=Lo(t,i);jt(n,r)||(s.uniform1iv(this.addr,r),Qt(n,r));for(let a=0;a!==i;++a)t.setTextureCube(e[a]||Ad,r[a])}function j_(s,e,t){const n=this.cache,i=e.length,r=Lo(t,i);jt(n,r)||(s.uniform1iv(this.addr,r),Qt(n,r));for(let a=0;a!==i;++a)t.setTexture2DArray(e[a]||bd,r[a])}function Q_(s){switch(s){case 5126:return U_;case 35664:return N_;case 35665:return z_;case 35666:return F_;case 35674:return O_;case 35675:return B_;case 35676:return k_;case 5124:case 35670:return V_;case 35667:case 35671:return H_;case 35668:case 35672:return G_;case 35669:case 35673:return W_;case 5125:return X_;case 36294:return Y_;case 36295:return q_;case 36296:return Z_;case 35678:case 36198:case 36298:case 36306:case 35682:return $_;case 35679:case 36299:case 36307:return K_;case 35680:case 36300:case 36308:case 36293:return J_;case 36289:case 36303:case 36311:case 36292:return j_}}class eM{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=D_(t.type)}}class tM{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Q_(t.type)}}class nM{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){const i=this.seq;for(let r=0,a=i.length;r!==a;++r){const o=i[r];o.setValue(e,t[o.id],n)}}}const dh=/(\w+)(\])?(\[|\.)?/g;function Ld(s,e){s.seq.push(e),s.map[e.id]=e}function iM(s,e,t){const n=s.name,i=n.length;for(dh.lastIndex=0;;){const r=dh.exec(n),a=dh.lastIndex;let o=r[1];const l=r[2]==="]",c=r[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===i){Ld(t,c===void 0?new eM(o,s,e):new tM(o,s,e));break}else{let d=t.map[o];d===void 0&&(d=new nM(o),Ld(t,d)),t=d}}}class Do{constructor(e,t){this.seq=[],this.map={};const n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){const o=e.getActiveUniform(t,a),l=e.getUniformLocation(t,o.name);iM(o,l,this)}const i=[],r=[];for(const a of this.seq)a.type===e.SAMPLER_2D_SHADOW||a.type===e.SAMPLER_CUBE_SHADOW||a.type===e.SAMPLER_2D_ARRAY_SHADOW?i.push(a):r.push(a);i.length>0&&(this.seq=i.concat(r))}setValue(e,t,n,i){const r=this.map[t];r!==void 0&&r.setValue(e,n,i)}setOptional(e,t,n){const i=t[n];i!==void 0&&this.setValue(e,n,i)}static upload(e,t,n,i){for(let r=0,a=t.length;r!==a;++r){const o=t[r],l=n[o.id];l.needsUpdate!==!1&&o.setValue(e,l.value,i)}}static seqWithValue(e,t){const n=[];for(let i=0,r=e.length;i!==r;++i){const a=e[i];a.id in t&&n.push(a)}return n}}function Dd(s,e,t){const n=s.createShader(e);return s.shaderSource(n,t),s.compileShader(n),n}const sM=37297;let rM=0;function aM(s,e){const t=s.split(`
`),n=[],i=Math.max(e-6,0),r=Math.min(e+6,t.length);for(let a=i;a<r;a++){const o=a+1;n.push(`${o===e?">":" "} ${o}: ${t[a]}`)}return n.join(`
`)}const Ud=new Ze;function oM(s){st._getMatrix(Ud,st.workingColorSpace,s);const e=`mat3( ${Ud.elements.map(t=>t.toFixed(4))} )`;switch(st.getTransfer(s)){case Ha:return[e,"LinearTransferOETF"];case _t:return[e,"sRGBTransferOETF"];default:return Fe("WebGLProgram: Unsupported color space: ",s),[e,"LinearTransferOETF"]}}function Nd(s,e,t){const n=s.getShaderParameter(e,s.COMPILE_STATUS),r=(s.getShaderInfoLog(e)||"").trim();if(n&&r==="")return"";const a=/ERROR: 0:(\d+)/.exec(r);if(a){const o=parseInt(a[1]);return t.toUpperCase()+`

`+r+`

`+aM(s.getShaderSource(e),o)}else return r}function lM(s,e){const t=oM(e);return[`vec4 ${s}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}const cM={[xl]:"Linear",[vl]:"Reinhard",[_l]:"Cineon",[Pa]:"ACESFilmic",[yl]:"AgX",[Sl]:"Neutral",[Ml]:"Custom"};function hM(s,e){const t=cM[e];return t===void 0?(Fe("WebGLProgram: Unsupported toneMapping:",e),"vec3 "+s+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+s+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const Uo=new L;function uM(){st.getLuminanceCoefficients(Uo);const s=Uo.x.toFixed(4),e=Uo.y.toFixed(4),t=Uo.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${s}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function fM(s){return[s.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",s.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(pa).join(`
`)}function dM(s){const e=[];for(const t in s){const n=s[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(`
`)}function pM(s,e){const t={},n=s.getProgramParameter(e,s.ACTIVE_ATTRIBUTES);for(let i=0;i<n;i++){const r=s.getActiveAttrib(e,i),a=r.name;let o=1;r.type===s.FLOAT_MAT2&&(o=2),r.type===s.FLOAT_MAT3&&(o=3),r.type===s.FLOAT_MAT4&&(o=4),t[a]={type:r.type,location:s.getAttribLocation(e,a),locationSize:o}}return t}function pa(s){return s!==""}function zd(s,e){const t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return s.replace(/NUM_SUN_LIGHTS/g,e.numSunLights).replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,e.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function Fd(s,e){return s.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}const mM=/^[ \t]*#include +<([\w\d./]+)>/gm;function ph(s){return s.replace(mM,xM)}const gM=new Map;function xM(s,e){let t=Qe[e];if(t===void 0){const n=gM.get(e);if(n!==void 0)t=Qe[n],Fe('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,n);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+e+">")}return ph(t)}const vM=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Od(s){return s.replace(vM,_M)}function _M(s,e,t,n){let i="";for(let r=parseInt(e);r<parseInt(t);r++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return i}function Bd(s){let e=`precision ${s.precision} float;
	precision ${s.precision} int;
	precision ${s.precision} sampler2D;
	precision ${s.precision} samplerCube;
	precision ${s.precision} sampler3D;
	precision ${s.precision} sampler2DArray;
	precision ${s.precision} sampler2DShadow;
	precision ${s.precision} samplerCubeShadow;
	precision ${s.precision} sampler2DArrayShadow;
	precision ${s.precision} isampler2D;
	precision ${s.precision} isampler3D;
	precision ${s.precision} isamplerCube;
	precision ${s.precision} isampler2DArray;
	precision ${s.precision} usampler2D;
	precision ${s.precision} usampler3D;
	precision ${s.precision} usamplerCube;
	precision ${s.precision} usampler2DArray;
	`;return s.precision==="highp"?e+=`
#define HIGH_PRECISION`:s.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:s.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}const MM={[Tr]:"SHADOWMAP_TYPE_PCF",[Ar]:"SHADOWMAP_TYPE_VSM"};function yM(s){return MM[s.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}const SM={[ns]:"ENVMAP_TYPE_CUBE",[bs]:"ENVMAP_TYPE_CUBE",[La]:"ENVMAP_TYPE_CUBE_UV"};function wM(s){return s.envMap===!1?"ENVMAP_TYPE_CUBE":SM[s.envMapMode]||"ENVMAP_TYPE_CUBE"}const bM={[bs]:"ENVMAP_MODE_REFRACTION"};function TM(s){return s.envMap===!1?"ENVMAP_MODE_REFLECTION":bM[s.envMapMode]||"ENVMAP_MODE_REFLECTION"}const AM={[gl]:"ENVMAP_BLENDING_MULTIPLY",[pm]:"ENVMAP_BLENDING_MIX",[mm]:"ENVMAP_BLENDING_ADD"};function EM(s){return s.envMap===!1?"ENVMAP_BLENDING_NONE":AM[s.combine]||"ENVMAP_BLENDING_NONE"}function CM(s){const e=s.envMapCubeUVHeight;if(e===null)return null;const t=Math.log2(e)-2,n=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:n,maxMip:t}}function RM(s,e,t,n){const i=s.getContext(),r=t.defines;let a=t.vertexShader,o=t.fragmentShader;const l=yM(t),c=wM(t),h=TM(t),d=EM(t),u=CM(t),f=fM(t),m=dM(r),_=i.createProgram();let p,g,v=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(p=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m].filter(pa).join(`
`),p.length>0&&(p+=`
`),g=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m].filter(pa).join(`
`),g.length>0&&(g+=`
`)):(p=[Bd(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexNormals?"#define HAS_NORMAL":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(pa).join(`
`),g=[Bd(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+h:"",t.envMap?"#define "+d:"",u?"#define CUBEUV_TEXEL_WIDTH "+u.texelWidth:"",u?"#define CUBEUV_TEXEL_HEIGHT "+u.texelHeight:"",u?"#define CUBEUV_MAX_MIP "+u.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.retroreflection?"#define USE_RETROREFLECTION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==oi?"#define TONE_MAPPING":"",t.toneMapping!==oi?Qe.tonemapping_pars_fragment:"",t.toneMapping!==oi?hM("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Qe.colorspace_pars_fragment,lM("linearToOutputTexel",t.outputColorSpace),uM(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(pa).join(`
`)),a=ph(a),a=zd(a,t),a=Fd(a,t),o=ph(o),o=zd(o,t),o=Fd(o,t),a=Od(a),o=Od(o),t.isRawShaderMaterial!==!0&&(v=`#version 300 es
`,p=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+p,g=["#define varying in",t.glslVersion===Ou?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===Ou?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+g);const M=v+p+a,x=v+g+o,w=Dd(i,i.VERTEX_SHADER,M),S=Dd(i,i.FRAGMENT_SHADER,x);i.attachShader(_,w),i.attachShader(_,S),t.index0AttributeName!==void 0?i.bindAttribLocation(_,0,t.index0AttributeName):t.hasPositionAttribute===!0&&i.bindAttribLocation(_,0,"position"),i.linkProgram(_);function A(P){if(s.debug.checkShaderErrors){const D=i.getProgramInfoLog(_)||"",U=i.getShaderInfoLog(w)||"",R=i.getShaderInfoLog(S)||"",B=D.trim(),V=U.trim(),q=R.trim();let se=!0,$=!0;if(i.getProgramParameter(_,i.LINK_STATUS)===!1)if(se=!1,typeof s.debug.onShaderError=="function")s.debug.onShaderError(i,_,w,S);else{const ee=Nd(i,w,"vertex"),ue=Nd(i,S,"fragment");He("WebGLProgram: Shader Error "+i.getError()+" - VALIDATE_STATUS "+i.getProgramParameter(_,i.VALIDATE_STATUS)+`

Material Name: `+P.name+`
Material Type: `+P.type+`

Program Info Log: `+B+`
`+ee+`
`+ue)}else B!==""?Fe("WebGLProgram: Program Info Log:",B):(V===""||q==="")&&($=!1);$&&(P.diagnostics={runnable:se,programLog:B,vertexShader:{log:V,prefix:p},fragmentShader:{log:q,prefix:g}})}i.deleteShader(w),i.deleteShader(S),y=new Do(i,_),T=pM(i,_)}let y;this.getUniforms=function(){return y===void 0&&A(this),y};let T;this.getAttributes=function(){return T===void 0&&A(this),T};let C=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return C===!1&&(C=i.getProgramParameter(_,sM)),C},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(_),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=rM++,this.cacheKey=e,this.usedTimes=1,this.program=_,this.vertexShader=w,this.fragmentShader=S,this}let PM=0;class IM{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,n){const i=this._getShaderCacheForMaterial(e);return i.has(t)===!1&&(i.add(t),t.usedTimes++),i.has(n)===!1&&(i.add(n),n.usedTimes++),this}remove(e){const t=this.materialCache.get(e);for(const n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){const t=this.materialCache;let n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){const t=this.shaderCache;let n=t.get(e);return n===void 0&&(n=new LM(e),t.set(e,n)),n}}class LM{constructor(e){this.id=PM++,this.code=e,this.usedTimes=0}}function DM(s){return s===is||s===ka||s===Va}function UM(s,e,t,n,i,r){const a=new xc,o=new IM,l=new Set,c=[],h=new Map,d=n.logarithmicDepthBuffer;let u=n.precision;const f={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function m(y){return l.add(y),y===0?"uv":`uv${y}`}function _(y,T,C,P,D,U){const R=P.fog,B=D.geometry,V=y.isMeshStandardMaterial||y.isMeshLambertMaterial||y.isMeshPhongMaterial?P.environment:null,q=y.isMeshStandardMaterial||y.isMeshLambertMaterial&&!y.envMap||y.isMeshPhongMaterial&&!y.envMap,se=e.get(y.envMap||V,q),$=se&&se.mapping===La?se.image.height:null,ee=f[y.type];y.precision!==null&&(u=n.getMaxPrecision(y.precision),u!==y.precision&&Fe("WebGLProgram.getParameters:",y.precision,"not supported, using",u,"instead."));const ue=B.morphAttributes.position||B.morphAttributes.normal||B.morphAttributes.color,ve=ue!==void 0?ue.length:0;let Me=0;B.morphAttributes.position!==void 0&&(Me=1),B.morphAttributes.normal!==void 0&&(Me=2),B.morphAttributes.color!==void 0&&(Me=3);let Xe,Oe,Ue,re;if(ee){const ft=mi[ee];Xe=ft.vertexShader,Oe=ft.fragmentShader}else{Xe=y.vertexShader,Oe=y.fragmentShader;const ft=o.getVertexShaderStage(y),ct=o.getFragmentShaderStage(y);o.update(y,ft,ct),Ue=ft.id,re=ct.id}const le=s.getRenderTarget(),ye=s.state.buffers.depth.getReversed(),Ne=D.isInstancedMesh===!0,we=D.isBatchedMesh===!0,Ge=!!y.map,Et=!!y.matcap,qe=!!se,Ve=!!y.aoMap,tt=!!y.lightMap,Ye=!!y.bumpMap&&y.wireframe===!1,at=!!y.normalMap,yt=!!y.displacementMap,kt=!!y.emissiveMap,it=!!y.metalnessMap,dt=!!y.roughnessMap,G=y.anisotropy>0,zt=y.clearcoat>0,Ke=y.dispersion>0,N=y.retroreflectivity>0,b=y.iridescence>0,Z=y.sheen>0,Q=y.transmission>0,he=G&&!!y.anisotropyMap,k=zt&&!!y.clearcoatMap,K=zt&&!!y.clearcoatNormalMap,Y=zt&&!!y.clearcoatRoughnessMap,ie=b&&!!y.iridescenceMap,xe=b&&!!y.iridescenceThicknessMap,O=Z&&!!y.sheenColorMap,z=Z&&!!y.sheenRoughnessMap,X=!!y.specularMap,J=!!y.specularColorMap,fe=!!y.specularIntensityMap,oe=Q&&!!y.transmissionMap,I=Q&&!!y.thicknessMap,ae=!!y.gradientMap,j=!!y.alphaMap,me=y.alphaTest>0,_e=!!y.alphaHash,de=!!y.extensions;let Se=oi;y.toneMapped&&(le===null||le.isXRRenderTarget===!0)&&(Se=s.toneMapping);const be={shaderID:ee,shaderType:y.type,shaderName:y.name,vertexShader:Xe,fragmentShader:Oe,defines:y.defines,customVertexShaderID:Ue,customFragmentShaderID:re,isRawShaderMaterial:y.isRawShaderMaterial===!0,glslVersion:y.glslVersion,precision:u,batching:we,batchingColor:we&&D._colorsTexture!==null,instancing:Ne,instancingColor:Ne&&D.instanceColor!==null,instancingMorph:Ne&&D.morphTexture!==null,outputColorSpace:le===null?s.outputColorSpace:le.isXRRenderTarget===!0?le.texture.colorSpace:st.workingColorSpace,alphaToCoverage:!!y.alphaToCoverage,map:Ge,matcap:Et,envMap:qe,envMapMode:qe&&se.mapping,envMapCubeUVHeight:$,aoMap:Ve,lightMap:tt,bumpMap:Ye,normalMap:at,displacementMap:yt,emissiveMap:kt,normalMapObjectSpace:at&&y.normalMapType===Mm,normalMapTangentSpace:at&&y.normalMapType===Dr,packedNormalMap:at&&y.normalMapType===Dr&&DM(y.normalMap.format),metalnessMap:it,roughnessMap:dt,anisotropy:G,anisotropyMap:he,clearcoat:zt,clearcoatMap:k,clearcoatNormalMap:K,clearcoatRoughnessMap:Y,dispersion:Ke,retroreflection:N,iridescence:b,iridescenceMap:ie,iridescenceThicknessMap:xe,sheen:Z,sheenColorMap:O,sheenRoughnessMap:z,specularMap:X,specularColorMap:J,specularIntensityMap:fe,transmission:Q,transmissionMap:oe,thicknessMap:I,gradientMap:ae,opaque:y.transparent===!1&&y.blending===ws&&y.alphaToCoverage===!1,alphaMap:j,alphaTest:me,alphaHash:_e,combine:y.combine,mapUv:Ge&&m(y.map.channel),aoMapUv:Ve&&m(y.aoMap.channel),lightMapUv:tt&&m(y.lightMap.channel),bumpMapUv:Ye&&m(y.bumpMap.channel),normalMapUv:at&&m(y.normalMap.channel),displacementMapUv:yt&&m(y.displacementMap.channel),emissiveMapUv:kt&&m(y.emissiveMap.channel),metalnessMapUv:it&&m(y.metalnessMap.channel),roughnessMapUv:dt&&m(y.roughnessMap.channel),anisotropyMapUv:he&&m(y.anisotropyMap.channel),clearcoatMapUv:k&&m(y.clearcoatMap.channel),clearcoatNormalMapUv:K&&m(y.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Y&&m(y.clearcoatRoughnessMap.channel),iridescenceMapUv:ie&&m(y.iridescenceMap.channel),iridescenceThicknessMapUv:xe&&m(y.iridescenceThicknessMap.channel),sheenColorMapUv:O&&m(y.sheenColorMap.channel),sheenRoughnessMapUv:z&&m(y.sheenRoughnessMap.channel),specularMapUv:X&&m(y.specularMap.channel),specularColorMapUv:J&&m(y.specularColorMap.channel),specularIntensityMapUv:fe&&m(y.specularIntensityMap.channel),transmissionMapUv:oe&&m(y.transmissionMap.channel),thicknessMapUv:I&&m(y.thicknessMap.channel),alphaMapUv:j&&m(y.alphaMap.channel),vertexTangents:!!B.attributes.tangent&&(at||G),vertexNormals:!!B.attributes.normal,vertexColors:y.vertexColors,vertexAlphas:y.vertexColors===!0&&!!B.attributes.color&&B.attributes.color.itemSize===4,pointsUvs:D.isPoints===!0&&!!B.attributes.uv&&(Ge||j),fog:!!R,useFog:y.fog===!0,fogExp2:!!R&&R.isFogExp2,flatShading:y.wireframe===!1&&(y.flatShading===!0||B.attributes.normal===void 0&&at===!1&&(y.isMeshLambertMaterial||y.isMeshPhongMaterial||y.isMeshStandardMaterial||y.isMeshPhysicalMaterial)),sizeAttenuation:y.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:ye,skinning:D.isSkinnedMesh===!0,hasPositionAttribute:B.attributes.position!==void 0,morphTargets:B.morphAttributes.position!==void 0,morphNormals:B.morphAttributes.normal!==void 0,morphColors:B.morphAttributes.color!==void 0,morphTargetsCount:ve,morphTextureStride:Me,numSunLights:T.sun.length,numDirLights:T.directional.length,numPointLights:T.point.length,numSpotLights:T.spot.length,numSpotLightMaps:T.spotLightMap.length,numRectAreaLights:T.rectArea.length,numHemiLights:T.hemi.length,numSunLightShadows:T.sunShadowMap.length,numDirLightShadows:T.directionalShadowMap.length,numPointLightShadows:T.pointShadowMap.length,numSpotLightShadows:T.spotShadowMap.length,numSpotLightShadowsWithMaps:T.numSpotLightShadowsWithMaps,numLightProbes:T.numLightProbes,numLightProbeGrids:U.length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:y.dithering,shadowMapEnabled:s.shadowMap.enabled&&C.length>0,shadowMapType:s.shadowMap.type,toneMapping:Se,decodeVideoTexture:Ge&&y.map.isVideoTexture===!0&&st.getTransfer(y.map.colorSpace)===_t,decodeVideoTextureEmissive:kt&&y.emissiveMap.isVideoTexture===!0&&st.getTransfer(y.emissiveMap.colorSpace)===_t,premultipliedAlpha:y.premultipliedAlpha,doubleSided:y.side===rn,flipSided:y.side===xn,useDepthPacking:y.depthPacking>=0,depthPacking:y.depthPacking||0,index0AttributeName:y.index0AttributeName,extensionClipCullDistance:de&&y.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(de&&y.extensions.multiDraw===!0||we)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:y.customProgramCacheKey()};return be.vertexUv1s=l.has(1),be.vertexUv2s=l.has(2),be.vertexUv3s=l.has(3),l.clear(),be}function p(y){const T=[];if(y.shaderID?T.push(y.shaderID):(T.push(y.customVertexShaderID),T.push(y.customFragmentShaderID)),y.defines!==void 0)for(const C in y.defines)T.push(C),T.push(y.defines[C]);return y.isRawShaderMaterial===!1&&(g(T,y),v(T,y),T.push(s.outputColorSpace)),T.push(y.customProgramCacheKey),T.join()}function g(y,T){y.push(T.precision),y.push(T.outputColorSpace),y.push(T.envMapMode),y.push(T.envMapCubeUVHeight),y.push(T.mapUv),y.push(T.alphaMapUv),y.push(T.lightMapUv),y.push(T.aoMapUv),y.push(T.bumpMapUv),y.push(T.normalMapUv),y.push(T.displacementMapUv),y.push(T.emissiveMapUv),y.push(T.metalnessMapUv),y.push(T.roughnessMapUv),y.push(T.anisotropyMapUv),y.push(T.clearcoatMapUv),y.push(T.clearcoatNormalMapUv),y.push(T.clearcoatRoughnessMapUv),y.push(T.iridescenceMapUv),y.push(T.iridescenceThicknessMapUv),y.push(T.sheenColorMapUv),y.push(T.sheenRoughnessMapUv),y.push(T.specularMapUv),y.push(T.specularColorMapUv),y.push(T.specularIntensityMapUv),y.push(T.transmissionMapUv),y.push(T.thicknessMapUv),y.push(T.combine),y.push(T.fogExp2),y.push(T.sizeAttenuation),y.push(T.morphTargetsCount),y.push(T.morphAttributeCount),y.push(T.numSunLights),y.push(T.numDirLights),y.push(T.numPointLights),y.push(T.numSpotLights),y.push(T.numSpotLightMaps),y.push(T.numHemiLights),y.push(T.numRectAreaLights),y.push(T.numSunLightShadows),y.push(T.numDirLightShadows),y.push(T.numPointLightShadows),y.push(T.numSpotLightShadows),y.push(T.numSpotLightShadowsWithMaps),y.push(T.numLightProbes),y.push(T.shadowMapType),y.push(T.toneMapping),y.push(T.numClippingPlanes),y.push(T.numClipIntersection),y.push(T.depthPacking)}function v(y,T){a.disableAll(),T.instancing&&a.enable(0),T.instancingColor&&a.enable(1),T.instancingMorph&&a.enable(2),T.matcap&&a.enable(3),T.envMap&&a.enable(4),T.normalMapObjectSpace&&a.enable(5),T.normalMapTangentSpace&&a.enable(6),T.clearcoat&&a.enable(7),T.iridescence&&a.enable(8),T.alphaTest&&a.enable(9),T.vertexColors&&a.enable(10),T.vertexAlphas&&a.enable(11),T.vertexUv1s&&a.enable(12),T.vertexUv2s&&a.enable(13),T.vertexUv3s&&a.enable(14),T.vertexTangents&&a.enable(15),T.anisotropy&&a.enable(16),T.alphaHash&&a.enable(17),T.batching&&a.enable(18),T.dispersion&&a.enable(19),T.retroreflection&&a.enable(24),T.batchingColor&&a.enable(20),T.gradientMap&&a.enable(21),T.packedNormalMap&&a.enable(22),T.vertexNormals&&a.enable(23),y.push(a.mask),a.disableAll(),T.fog&&a.enable(0),T.useFog&&a.enable(1),T.flatShading&&a.enable(2),T.logarithmicDepthBuffer&&a.enable(3),T.reversedDepthBuffer&&a.enable(4),T.skinning&&a.enable(5),T.morphTargets&&a.enable(6),T.morphNormals&&a.enable(7),T.morphColors&&a.enable(8),T.premultipliedAlpha&&a.enable(9),T.shadowMapEnabled&&a.enable(10),T.doubleSided&&a.enable(11),T.flipSided&&a.enable(12),T.useDepthPacking&&a.enable(13),T.dithering&&a.enable(14),T.transmission&&a.enable(15),T.sheen&&a.enable(16),T.opaque&&a.enable(17),T.pointsUvs&&a.enable(18),T.decodeVideoTexture&&a.enable(19),T.decodeVideoTextureEmissive&&a.enable(20),T.alphaToCoverage&&a.enable(21),T.numLightProbeGrids>0&&a.enable(22),T.hasPositionAttribute&&a.enable(23),y.push(a.mask)}function M(y){const T=f[y.type];let C;if(T){const P=mi[T];C=ii.clone(P.uniforms)}else C=y.uniforms;return C}function x(y,T){let C=h.get(T);return C!==void 0?++C.usedTimes:(C=new RM(s,T,y,i),c.push(C),h.set(T,C)),C}function w(y){if(--y.usedTimes===0){const T=c.indexOf(y);c[T]=c[c.length-1],c.pop(),h.delete(y.cacheKey),y.destroy()}}function S(y){o.remove(y)}function A(){o.dispose()}return{getParameters:_,getProgramCacheKey:p,getUniforms:M,acquireProgram:x,releaseProgram:w,releaseShaderCache:S,programs:c,dispose:A}}function NM(){let s=new WeakMap;function e(a){return s.has(a)}function t(a){let o=s.get(a);return o===void 0&&(o={},s.set(a,o)),o}function n(a){s.delete(a)}function i(a,o,l){s.get(a)[o]=l}function r(){s=new WeakMap}return{has:e,get:t,remove:n,update:i,dispose:r}}function zM(s,e){return s.groupOrder!==e.groupOrder?s.groupOrder-e.groupOrder:s.renderOrder!==e.renderOrder?s.renderOrder-e.renderOrder:s.material.id!==e.material.id?s.material.id-e.material.id:s.materialVariant!==e.materialVariant?s.materialVariant-e.materialVariant:s.z!==e.z?s.z-e.z:s.id-e.id}function kd(s,e){return s.groupOrder!==e.groupOrder?s.groupOrder-e.groupOrder:s.renderOrder!==e.renderOrder?s.renderOrder-e.renderOrder:s.z!==e.z?e.z-s.z:s.id-e.id}function Vd(){const s=[];let e=0;const t=[],n=[],i=[];function r(){e=0,t.length=0,n.length=0,i.length=0}function a(u){let f=0;return u.isInstancedMesh&&(f+=2),u.isSkinnedMesh&&(f+=1),f}function o(u,f,m,_,p,g){let v=s[e];return v===void 0?(v={id:u.id,object:u,geometry:f,material:m,materialVariant:a(u),groupOrder:_,renderOrder:u.renderOrder,z:p,group:g},s[e]=v):(v.id=u.id,v.object=u,v.geometry=f,v.material=m,v.materialVariant=a(u),v.groupOrder=_,v.renderOrder=u.renderOrder,v.z=p,v.group=g),e++,v}function l(u,f,m,_,p,g,v){v.reversedDepth===!0&&(p=-p);const M=o(u,f,m,_,p,g);m.transmission>0?n.push(M):m.transparent===!0?i.push(M):t.push(M)}function c(u,f,m,_,p,g){const v=o(u,f,m,_,p,g);m.transmission>0?n.unshift(v):m.transparent===!0?i.unshift(v):t.unshift(v)}function h(u,f){t.length>1&&t.sort(u||zM),n.length>1&&n.sort(f||kd),i.length>1&&i.sort(f||kd)}function d(){for(let u=e,f=s.length;u<f;u++){const m=s[u];if(m.id===null)break;m.id=null,m.object=null,m.geometry=null,m.material=null,m.group=null}}return{opaque:t,transmissive:n,transparent:i,init:r,push:l,unshift:c,finish:d,sort:h}}function FM(){let s=new WeakMap;function e(n,i){const r=s.get(n);let a;return r===void 0?(a=new Vd,s.set(n,[a])):i>=r.length?(a=new Vd,r.push(a)):a=r[i],a}function t(){s=new WeakMap}return{get:e,dispose:t}}function OM(){const s={};return{get:function(e){if(s[e.id]!==void 0)return s[e.id];let t;switch(e.type){case"SunLight":case"DirectionalLight":t={direction:new L,color:new ge};break;case"SpotLight":t={position:new L,direction:new L,color:new ge,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new L,color:new ge,distance:0,decay:0};break;case"HemisphereLight":t={direction:new L,skyColor:new ge,groundColor:new ge};break;case"RectAreaLight":t={color:new ge,position:new L,halfWidth:new L,halfHeight:new L};break}return s[e.id]=t,t}}}function BM(){const s={};return{get:function(e){if(s[e.id]!==void 0)return s[e.id];let t;switch(e.type){case"SunLight":case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new pe};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new pe};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new pe,shadowCameraNear:1,shadowCameraFar:1e3};break}return s[e.id]=t,t}}}let kM=0;function VM(s,e){return(e.castShadow?2:0)-(s.castShadow?2:0)+(e.map?1:0)-(s.map?1:0)}function HM(s){const e=new OM,t=BM(),n={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new L);const i=new L,r=new De,a=new De;function o(c){let h=0,d=0,u=0;for(let D=0;D<9;D++)n.probe[D].set(0,0,0);let f=0,m=0,_=0,p=0,g=0,v=0,M=0,x=0,w=0,S=0,A=0,y=0,T=0,C=0;c.sort(VM);for(let D=0,U=c.length;D<U;D++){const R=c[D],B=R.color,V=R.intensity,q=R.distance;let se=null;if(R.shadow&&R.shadow.map&&(R.shadow.map.texture.format===is?se=R.shadow.map.texture:se=R.shadow.map.depthTexture||R.shadow.map.texture),R.isAmbientLight)h+=B.r*V,d+=B.g*V,u+=B.b*V;else if(R.isLightProbe){for(let $=0;$<9;$++)n.probe[$].addScaledVector(R.sh.coefficients[$],V);C++}else if(R.isSunLight){const $=e.get(R);if($.color.copy(R.color).multiplyScalar(R.intensity),R.castShadow){const ee=R.shadow,ue=t.get(R);ue.shadowIntensity=ee.intensity,ue.shadowBias=ee.bias,ue.shadowNormalBias=ee.normalBias,ue.shadowRadius=ee.radius,ue.shadowMapSize.copy(ee.mapSize).multiply(ee.getFrameExtents()),n.sunShadow[m]=ue,n.sunShadowMap[m]=se;const ve=ee.getViewportCount();for(let Me=0;Me<ve;Me++)n.sunShadowMatrix[_+Me]=ee.getMatrix(Me),n.sunShadowCascade[_+Me]=ee._cascadeData[Me];_+=ve,m++}n.sun[f]=$,f++}else if(R.isDirectionalLight){const $=e.get(R);if($.color.copy(R.color).multiplyScalar(R.intensity),R.castShadow){const ee=R.shadow,ue=t.get(R);ue.shadowIntensity=ee.intensity,ue.shadowBias=ee.bias,ue.shadowNormalBias=ee.normalBias,ue.shadowRadius=ee.radius,ue.shadowMapSize=ee.mapSize,n.directionalShadow[p]=ue,n.directionalShadowMap[p]=se,n.directionalShadowMatrix[p]=R.shadow.matrix,w++}n.directional[p]=$,p++}else if(R.isSpotLight){const $=e.get(R);$.position.setFromMatrixPosition(R.matrixWorld),$.color.copy(B).multiplyScalar(V),$.distance=q,$.coneCos=Math.cos(R.angle),$.penumbraCos=Math.cos(R.angle*(1-R.penumbra)),$.decay=R.decay,n.spot[v]=$;const ee=R.shadow;if(R.map&&(n.spotLightMap[y]=R.map,y++,ee.updateMatrices(R),R.castShadow&&T++),n.spotLightMatrix[v]=ee.matrix,R.castShadow){const ue=t.get(R);ue.shadowIntensity=ee.intensity,ue.shadowBias=ee.bias,ue.shadowNormalBias=ee.normalBias,ue.shadowRadius=ee.radius,ue.shadowMapSize=ee.mapSize,n.spotShadow[v]=ue,n.spotShadowMap[v]=se,A++}v++}else if(R.isRectAreaLight){const $=e.get(R);$.color.copy(B).multiplyScalar(V),$.halfWidth.set(R.width*.5,0,0),$.halfHeight.set(0,R.height*.5,0),n.rectArea[M]=$,M++}else if(R.isPointLight){const $=e.get(R);if($.color.copy(R.color).multiplyScalar(R.intensity),$.distance=R.distance,$.decay=R.decay,R.castShadow){const ee=R.shadow,ue=t.get(R);ue.shadowIntensity=ee.intensity,ue.shadowBias=ee.bias,ue.shadowNormalBias=ee.normalBias,ue.shadowRadius=ee.radius,ue.shadowMapSize=ee.mapSize,ue.shadowCameraNear=ee.camera.near,ue.shadowCameraFar=ee.camera.far,n.pointShadow[g]=ue,n.pointShadowMap[g]=se,n.pointShadowMatrix[g]=R.shadow.matrix,S++}n.point[g]=$,g++}else if(R.isHemisphereLight){const $=e.get(R);$.skyColor.copy(R.color).multiplyScalar(V),$.groundColor.copy(R.groundColor).multiplyScalar(V),n.hemi[x]=$,x++}}M>0&&(s.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=Te.LTC_FLOAT_1,n.rectAreaLTC2=Te.LTC_FLOAT_2):(n.rectAreaLTC1=Te.LTC_HALF_1,n.rectAreaLTC2=Te.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=d,n.ambient[2]=u;const P=n.hash;(P.sunLength!==f||P.directionalLength!==p||P.pointLength!==g||P.spotLength!==v||P.rectAreaLength!==M||P.hemiLength!==x||P.numSunShadows!==m||P.numDirectionalShadows!==w||P.numPointShadows!==S||P.numSpotShadows!==A||P.numSpotMaps!==y||P.numLightProbes!==C)&&(n.sun.length=f,n.directional.length=p,n.spot.length=v,n.rectArea.length=M,n.point.length=g,n.hemi.length=x,n.sunShadow.length=m,n.sunShadowMap.length=m,n.sunShadowMatrix.length=_,n.sunShadowCascade.length=_,n.directionalShadow.length=w,n.directionalShadowMap.length=w,n.directionalShadowMatrix.length=w,n.pointShadow.length=S,n.pointShadowMap.length=S,n.pointShadowMatrix.length=S,n.spotShadow.length=A,n.spotShadowMap.length=A,n.spotLightMatrix.length=A+y-T,n.spotLightMap.length=y,n.numSpotLightShadowsWithMaps=T,n.numLightProbes=C,P.sunLength=f,P.directionalLength=p,P.pointLength=g,P.spotLength=v,P.rectAreaLength=M,P.hemiLength=x,P.numSunShadows=m,P.numDirectionalShadows=w,P.numPointShadows=S,P.numSpotShadows=A,P.numSpotMaps=y,P.numLightProbes=C,n.version=kM++)}function l(c,h){let d=0,u=0,f=0,m=0,_=0,p=0;const g=h.matrixWorldInverse;for(let v=0,M=c.length;v<M;v++){const x=c[v];if(x.isSunLight){const w=n.sun[d];w.direction.setFromMatrixPosition(x.matrixWorld),w.direction.transformDirection(g),d++}else if(x.isDirectionalLight){const w=n.directional[u];w.direction.setFromMatrixPosition(x.matrixWorld),i.setFromMatrixPosition(x.target.matrixWorld),w.direction.sub(i),w.direction.transformDirection(g),u++}else if(x.isSpotLight){const w=n.spot[m];w.position.setFromMatrixPosition(x.matrixWorld),w.position.applyMatrix4(g),w.direction.setFromMatrixPosition(x.matrixWorld),i.setFromMatrixPosition(x.target.matrixWorld),w.direction.sub(i),w.direction.transformDirection(g),m++}else if(x.isRectAreaLight){const w=n.rectArea[_];w.position.setFromMatrixPosition(x.matrixWorld),w.position.applyMatrix4(g),a.identity(),r.copy(x.matrixWorld),r.premultiply(g),a.extractRotation(r),w.halfWidth.set(x.width*.5,0,0),w.halfHeight.set(0,x.height*.5,0),w.halfWidth.applyMatrix4(a),w.halfHeight.applyMatrix4(a),_++}else if(x.isPointLight){const w=n.point[f];w.position.setFromMatrixPosition(x.matrixWorld),w.position.applyMatrix4(g),f++}else if(x.isHemisphereLight){const w=n.hemi[p];w.direction.setFromMatrixPosition(x.matrixWorld),w.direction.transformDirection(g),p++}}}return{setup:o,setupView:l,state:n}}function Hd(s){const e=new HM(s),t=[],n=[],i=[];function r(u){d.camera=u,t.length=0,n.length=0,i.length=0}function a(u){t.push(u)}function o(u){n.push(u)}function l(u){i.push(u)}function c(){e.setup(t)}function h(u){e.setupView(t,u)}const d={lightsArray:t,shadowsArray:n,lightProbeGridArray:i,camera:null,lights:e,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:d,setupLights:c,setupLightsView:h,pushLight:a,pushShadow:o,pushLightProbeGrid:l}}function GM(s){let e=new WeakMap;function t(i,r=0){const a=e.get(i);let o;return a===void 0?(o=new Hd(s),e.set(i,[o])):r>=a.length?(o=new Hd(s),a.push(o)):o=a[r],o}function n(){e=new WeakMap}return{get:t,dispose:n}}const WM=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,XM=`uniform sampler2D shadow_pass;
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
}`,YM=[new L(1,0,0),new L(-1,0,0),new L(0,1,0),new L(0,-1,0),new L(0,0,1),new L(0,0,-1)],qM=[new L(0,-1,0),new L(0,-1,0),new L(0,0,1),new L(0,0,-1),new L(0,-1,0),new L(0,-1,0)],Gd=new De,ma=new L,mh=new L;function ZM(s,e,t){let n=new Oc;const i=new pe,r=new pe,a=new Mt,o=new rg,l=new ag,c={},h=t.maxTextureSize,d={[ki]:xn,[xn]:ki,[rn]:rn},u=new gt({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new pe},radius:{value:4}},vertexShader:WM,fragmentShader:XM}),f=u.clone();f.defines.HORIZONTAL_PASS=1;const m=new At;m.setAttribute("position",new Ot(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const _=new $e(m,u),p=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Tr;let g=this.type;this.render=function(S,A,y){if(p.enabled===!1||p.autoUpdate===!1&&p.needsUpdate===!1||S.length===0)return;this.type===Qp&&(Fe("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=Tr);const T=s.getRenderTarget(),C=s.getActiveCubeFace(),P=s.getActiveMipmapLevel(),D=s.state;D.setBlending(an),D.buffers.depth.getReversed()===!0?D.buffers.color.setClear(0,0,0,0):D.buffers.color.setClear(1,1,1,1),D.buffers.depth.setTest(!0),D.setScissorTest(!1);const U=g!==this.type;U&&A.traverse(function(R){R.material&&(Array.isArray(R.material)?R.material.forEach(B=>B.needsUpdate=!0):R.material.needsUpdate=!0)});for(let R=0,B=S.length;R<B;R++){const V=S[R],q=V.shadow;if(q===void 0){Fe("WebGLShadowMap:",V,"has no shadow.");continue}if(q.autoUpdate===!1&&q.needsUpdate===!1)continue;i.copy(q.mapSize);const se=q.getFrameExtents();i.multiply(se),r.copy(q.mapSize),(i.x>h||i.y>h)&&(i.x>h&&(r.x=Math.floor(h/se.x),i.x=r.x*se.x,q.mapSize.x=r.x),i.y>h&&(r.y=Math.floor(h/se.y),i.y=r.y*se.y,q.mapSize.y=r.y));const $=s.state.buffers.depth.getReversed();if(q.camera._reversedDepth=$,q.map===null||U===!0){if(q.map!==null&&(q.map.depthTexture!==null&&(q.map.depthTexture.dispose(),q.map.depthTexture=null),q.map.dispose()),this.type===Ar){if(V.isPointLight){Fe("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}q.map=new on(i.x,i.y,{format:is,type:un,minFilter:Gt,magFilter:Gt,generateMipmaps:!1}),q.map.texture.name=V.name+".shadowMap",q.map.depthTexture=new Ys(i.x,i.y,On),q.map.depthTexture.name=V.name+".shadowMapDepth",q.map.depthTexture.format=Ai,q.map.depthTexture.compareFunction=null,q.map.depthTexture.minFilter=Ht,q.map.depthTexture.magFilter=Ht}else V.isPointLight?(q.map=new Sd(i.x),q.map.depthTexture=new b0(i.x,li)):(q.map=new on(i.x,i.y),q.map.depthTexture=new Ys(i.x,i.y,li)),q.map.depthTexture.name=V.name+".shadowMap",q.map.depthTexture.format=Ai,this.type===Tr?(q.map.depthTexture.compareFunction=$?hc:cc,q.map.depthTexture.minFilter=Gt,q.map.depthTexture.magFilter=Gt):(q.map.depthTexture.compareFunction=null,q.map.depthTexture.minFilter=Ht,q.map.depthTexture.magFilter=Ht);q.camera.updateProjectionMatrix()}q.map.isWebGLCubeRenderTarget!==!0&&(q.map.width!==i.x||q.map.height!==i.y)&&q.map.setSize(i.x,i.y);const ee=q.map.isWebGLCubeRenderTarget?6:q.getViewportCount();V.isPointLight!==!0&&q.updateMatrices(V,y);for(let ue=0;ue<ee;ue++){const ve=q.getCamera(ue);if(V.isPointLight){const Me=q.camera,Xe=q.matrix,Oe=V.distance||Me.far;Oe!==Me.far&&(Me.far=Oe,Me.updateProjectionMatrix()),ma.setFromMatrixPosition(V.matrixWorld),Me.position.copy(ma),mh.copy(Me.position),mh.add(YM[ue]),Me.up.copy(qM[ue]),Me.lookAt(mh),Me.updateMatrixWorld(),Xe.makeTranslation(-ma.x,-ma.y,-ma.z),Gd.multiplyMatrices(Me.projectionMatrix,Me.matrixWorldInverse),q._frustum.setFromProjectionMatrix(Gd,Me.coordinateSystem,Me.reversedDepth)}if(q.map.isWebGLCubeRenderTarget)s.setRenderTarget(q.map,ue),s.clear();else{ue===0&&(s.setRenderTarget(q.map),s.clear());const Me=q.getViewport(ue);a.set(r.x*Me.x,r.y*Me.y,r.x*Me.z,r.y*Me.w),D.viewport(a)}n=q.getFrustum(ue),x(A,y,ve,V,this.type)}q.isPointLightShadow!==!0&&this.type===Ar&&v(q,y),q.needsUpdate=!1}g=this.type,p.needsUpdate=!1,s.setRenderTarget(T,C,P)};function v(S,A){const y=e.update(_);u.defines.VSM_SAMPLES!==S.blurSamples&&(u.defines.VSM_SAMPLES=S.blurSamples,f.defines.VSM_SAMPLES=S.blurSamples,u.needsUpdate=!0,f.needsUpdate=!0),S.mapPass===null?S.mapPass=new on(i.x,i.y,{format:is,type:un}):(S.mapPass.width!==S.map.width||S.mapPass.height!==S.map.height)&&S.mapPass.setSize(S.map.width,S.map.height),u.uniforms.shadow_pass.value=S.map.depthTexture,u.uniforms.resolution.value.set(S.map.width,S.map.height),u.uniforms.radius.value=S.radius,s.setRenderTarget(S.mapPass),s.clear(),s.renderBufferDirect(A,null,y,u,_,null),f.uniforms.shadow_pass.value=S.mapPass.texture,f.uniforms.resolution.value.set(S.map.width,S.map.height),f.uniforms.radius.value=S.radius,s.setRenderTarget(S.map),s.clear(),s.renderBufferDirect(A,null,y,f,_,null)}function M(S,A,y,T){let C=null;const P=y.isPointLight===!0?S.customDistanceMaterial:S.customDepthMaterial;if(P!==void 0)C=P;else if(C=y.isPointLight===!0?l:o,s.localClippingEnabled&&A.clipShadows===!0&&Array.isArray(A.clippingPlanes)&&A.clippingPlanes.length!==0||A.displacementMap&&A.displacementScale!==0||A.alphaMap&&A.alphaTest>0||A.map&&A.alphaTest>0||A.alphaToCoverage===!0){const D=C.uuid,U=A.uuid;let R=c[D];R===void 0&&(R={},c[D]=R);let B=R[U];B===void 0&&(B=C.clone(),R[U]=B,A.addEventListener("dispose",w)),C=B}if(C.visible=A.visible,C.wireframe=A.wireframe,T===Ar?C.side=A.shadowSide!==null?A.shadowSide:A.side:C.side=A.shadowSide!==null?A.shadowSide:d[A.side],C.alphaMap=A.alphaMap,C.alphaTest=A.alphaToCoverage===!0?.5:A.alphaTest,C.map=A.map,C.clipShadows=A.clipShadows,C.clippingPlanes=A.clippingPlanes,C.clipIntersection=A.clipIntersection,C.displacementMap=A.displacementMap,C.displacementScale=A.displacementScale,C.displacementBias=A.displacementBias,C.wireframeLinewidth=A.wireframeLinewidth,C.linewidth=A.linewidth,y.isPointLight===!0&&C.isMeshDistanceMaterial===!0){const D=s.properties.get(C);D.light=y}return C}function x(S,A,y,T,C){if(S.visible===!1)return;if(S.layers.test(A.layers)&&(S.isMesh||S.isLine||S.isPoints)&&(S.castShadow||S.receiveShadow&&C===Ar)&&(!S.frustumCulled||S.intersectsFrustum(n))){S.modelViewMatrix.multiplyMatrices(y.matrixWorldInverse,S.matrixWorld);const U=e.update(S),R=S.material;if(Array.isArray(R)){const B=U.groups;for(let V=0,q=B.length;V<q;V++){const se=B[V],$=R[se.materialIndex];if($&&$.visible){const ee=M(S,$,T,C);S.onBeforeShadow(s,S,A,y,U,ee,se),s.renderBufferDirect(y,null,U,ee,S,se),S.onAfterShadow(s,S,A,y,U,ee,se)}}}else if(R.visible){const B=M(S,R,T,C);S.onBeforeShadow(s,S,A,y,U,B,null),s.renderBufferDirect(y,null,U,B,S,null),S.onAfterShadow(s,S,A,y,U,B,null)}}const D=S.children;for(let U=0,R=D.length;U<R;U++)x(D[U],A,y,T,C)}function w(S){S.target.removeEventListener("dispose",w);for(const y in c){const T=c[y],C=S.target.uuid;C in T&&(T[C].dispose(),delete T[C])}}}function $M(s,e){function t(){let I=!1;const ae=new Mt;let j=null;const me=new Mt(0,0,0,0);return{setMask:function(_e){j!==_e&&!I&&(s.colorMask(_e,_e,_e,_e),j=_e)},setLocked:function(_e){I=_e},setClear:function(_e,de,Se,be,ft){ft===!0&&(_e*=be,de*=be,Se*=be),ae.set(_e,de,Se,be),me.equals(ae)===!1&&(s.clearColor(_e,de,Se,be),me.copy(ae))},reset:function(){I=!1,j=null,me.set(-1,0,0,0)}}}function n(){let I=!1,ae=!1,j=null,me=null,_e=null;return{setReversed:function(de){if(ae!==de){const Se=e.get("EXT_clip_control");de?Se.clipControlEXT(Se.LOWER_LEFT_EXT,Se.ZERO_TO_ONE_EXT):Se.clipControlEXT(Se.LOWER_LEFT_EXT,Se.NEGATIVE_ONE_TO_ONE_EXT),ae=de;const be=_e;_e=null,this.setClear(be)}},getReversed:function(){return ae},setTest:function(de){de?le(s.DEPTH_TEST):ye(s.DEPTH_TEST)},setMask:function(de){j!==de&&!I&&(s.depthMask(de),j=de)},setFunc:function(de){if(ae&&(de=Lm[de]),me!==de){switch(de){case cl:s.depthFunc(s.NEVER);break;case hl:s.depthFunc(s.ALWAYS);break;case ul:s.depthFunc(s.LESS);break;case Cr:s.depthFunc(s.LEQUAL);break;case fl:s.depthFunc(s.EQUAL);break;case dl:s.depthFunc(s.GEQUAL);break;case pl:s.depthFunc(s.GREATER);break;case ml:s.depthFunc(s.NOTEQUAL);break;default:s.depthFunc(s.LEQUAL)}me=de}},setLocked:function(de){I=de},setClear:function(de){_e!==de&&(_e=de,ae&&(de=1-de),s.clearDepth(de))},reset:function(){I=!1,j=null,me=null,_e=null,ae=!1}}}function i(){let I=!1,ae=null,j=null,me=null,_e=null,de=null,Se=null,be=null,ft=null;return{setTest:function(ct){I||(ct?le(s.STENCIL_TEST):ye(s.STENCIL_TEST))},setMask:function(ct){ae!==ct&&!I&&(s.stencilMask(ct),ae=ct)},setFunc:function(ct,sn,En){(j!==ct||me!==sn||_e!==En)&&(s.stencilFunc(ct,sn,En),j=ct,me=sn,_e=En)},setOp:function(ct,sn,En){(de!==ct||Se!==sn||be!==En)&&(s.stencilOp(ct,sn,En),de=ct,Se=sn,be=En)},setLocked:function(ct){I=ct},setClear:function(ct){ft!==ct&&(s.clearStencil(ct),ft=ct)},reset:function(){I=!1,ae=null,j=null,me=null,_e=null,de=null,Se=null,be=null,ft=null}}}const r=new t,a=new n,o=new i,l=new WeakMap,c=new WeakMap;let h={},d={},u={},f=new WeakMap,m=[],_=null,p=!1,g=null,v=null,M=null,x=null,w=null,S=null,A=null,y=new ge(0,0,0),T=0,C=!1,P=null,D=null,U=null,R=null,B=null;const V=s.getParameter(s.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let q=!1,se=0;const $=s.getParameter(s.VERSION);$.indexOf("WebGL")!==-1?(se=parseFloat(/^WebGL (\d)/.exec($)[1]),q=se>=1):$.indexOf("OpenGL ES")!==-1&&(se=parseFloat(/^OpenGL ES (\d)/.exec($)[1]),q=se>=2);let ee=null,ue={};const ve=s.getParameter(s.SCISSOR_BOX),Me=s.getParameter(s.VIEWPORT),Xe=new Mt().fromArray(ve),Oe=new Mt().fromArray(Me);function Ue(I,ae,j,me){const _e=new Uint8Array(4),de=s.createTexture();s.bindTexture(I,de),s.texParameteri(I,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri(I,s.TEXTURE_MAG_FILTER,s.NEAREST);for(let Se=0;Se<j;Se++)I===s.TEXTURE_3D||I===s.TEXTURE_2D_ARRAY?s.texImage3D(ae,0,s.RGBA,1,1,me,0,s.RGBA,s.UNSIGNED_BYTE,_e):s.texImage2D(ae+Se,0,s.RGBA,1,1,0,s.RGBA,s.UNSIGNED_BYTE,_e);return de}const re={};re[s.TEXTURE_2D]=Ue(s.TEXTURE_2D,s.TEXTURE_2D,1),re[s.TEXTURE_CUBE_MAP]=Ue(s.TEXTURE_CUBE_MAP,s.TEXTURE_CUBE_MAP_POSITIVE_X,6),re[s.TEXTURE_2D_ARRAY]=Ue(s.TEXTURE_2D_ARRAY,s.TEXTURE_2D_ARRAY,1,1),re[s.TEXTURE_3D]=Ue(s.TEXTURE_3D,s.TEXTURE_3D,1,1),r.setClear(0,0,0,1),a.setClear(1),o.setClear(0),le(s.DEPTH_TEST),a.setFunc(Cr),Ye(!1),at(xu),le(s.CULL_FACE),Ve(an);function le(I){h[I]!==!0&&(s.enable(I),h[I]=!0)}function ye(I){h[I]!==!1&&(s.disable(I),h[I]=!1)}function Ne(I,ae){return u[I]!==ae?(s.bindFramebuffer(I,ae),u[I]=ae,I===s.DRAW_FRAMEBUFFER&&(u[s.FRAMEBUFFER]=ae),I===s.FRAMEBUFFER&&(u[s.DRAW_FRAMEBUFFER]=ae),!0):!1}function we(I,ae){let j=m,me=!1;if(I){j=f.get(ae),j===void 0&&(j=[],f.set(ae,j));const _e=I.textures;if(j.length!==_e.length||j[0]!==s.COLOR_ATTACHMENT0){for(let de=0,Se=_e.length;de<Se;de++)j[de]=s.COLOR_ATTACHMENT0+de;j.length=_e.length,me=!0}}else j[0]!==s.BACK&&(j[0]=s.BACK,me=!0);me&&s.drawBuffers(j)}function Ge(I){return _!==I?(s.useProgram(I),_=I,!0):!1}const Et={[ai]:s.FUNC_ADD,[em]:s.FUNC_SUBTRACT,[tm]:s.FUNC_REVERSE_SUBTRACT};Et[nm]=s.MIN,Et[im]=s.MAX;const qe={[Er]:s.ZERO,[sm]:s.ONE,[rm]:s.SRC_COLOR,[yu]:s.SRC_ALPHA,[cm]:s.SRC_ALPHA_SATURATE,[ll]:s.DST_COLOR,[ol]:s.DST_ALPHA,[am]:s.ONE_MINUS_SRC_COLOR,[Su]:s.ONE_MINUS_SRC_ALPHA,[lm]:s.ONE_MINUS_DST_COLOR,[om]:s.ONE_MINUS_DST_ALPHA,[hm]:s.CONSTANT_COLOR,[um]:s.ONE_MINUS_CONSTANT_COLOR,[fm]:s.CONSTANT_ALPHA,[dm]:s.ONE_MINUS_CONSTANT_ALPHA};function Ve(I,ae,j,me,_e,de,Se,be,ft,ct){if(I===an){p===!0&&(ye(s.BLEND),p=!1);return}if(p===!1&&(le(s.BLEND),p=!0),I!==Mu){if(I!==g||ct!==C){if((v!==ai||w!==ai)&&(s.blendEquation(s.FUNC_ADD),v=ai,w=ai),ct)switch(I){case ws:s.blendFuncSeparate(s.ONE,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case Jn:s.blendFunc(s.ONE,s.ONE);break;case vu:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case _u:s.blendFuncSeparate(s.DST_COLOR,s.ONE_MINUS_SRC_ALPHA,s.ZERO,s.ONE);break;default:He("WebGLState: Invalid blending: ",I);break}else switch(I){case ws:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case Jn:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE,s.ONE,s.ONE);break;case vu:He("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case _u:He("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:He("WebGLState: Invalid blending: ",I);break}M=null,x=null,S=null,A=null,y.set(0,0,0),T=0,g=I,C=ct}return}_e=_e||ae,de=de||j,Se=Se||me,(ae!==v||_e!==w)&&(s.blendEquationSeparate(Et[ae],Et[_e]),v=ae,w=_e),(j!==M||me!==x||de!==S||Se!==A)&&(s.blendFuncSeparate(qe[j],qe[me],qe[de],qe[Se]),M=j,x=me,S=de,A=Se),(be.equals(y)===!1||ft!==T)&&(s.blendColor(be.r,be.g,be.b,ft),y.copy(be),T=ft),g=I,C=!1}function tt(I,ae){I.side===rn?ye(s.CULL_FACE):le(s.CULL_FACE);let j=I.side===xn;ae&&(j=!j),Ye(j),I.blending===ws&&I.transparent===!1?Ve(an):Ve(I.blending,I.blendEquation,I.blendSrc,I.blendDst,I.blendEquationAlpha,I.blendSrcAlpha,I.blendDstAlpha,I.blendColor,I.blendAlpha,I.premultipliedAlpha),a.setFunc(I.depthFunc),a.setTest(I.depthTest),a.setMask(I.depthWrite),r.setMask(I.colorWrite);const me=I.stencilWrite;o.setTest(me),me&&(o.setMask(I.stencilWriteMask),o.setFunc(I.stencilFunc,I.stencilRef,I.stencilFuncMask),o.setOp(I.stencilFail,I.stencilZFail,I.stencilZPass)),kt(I.polygonOffset,I.polygonOffsetFactor,I.polygonOffsetUnits),I.alphaToCoverage===!0?le(s.SAMPLE_ALPHA_TO_COVERAGE):ye(s.SAMPLE_ALPHA_TO_COVERAGE)}function Ye(I){P!==I&&(I?s.frontFace(s.CW):s.frontFace(s.CCW),P=I)}function at(I){I!==Jp?(le(s.CULL_FACE),I!==D&&(I===xu?s.cullFace(s.BACK):I===jp?s.cullFace(s.FRONT):s.cullFace(s.FRONT_AND_BACK))):ye(s.CULL_FACE),D=I}function yt(I){I!==U&&(q&&s.lineWidth(I),U=I)}function kt(I,ae,j){I?(le(s.POLYGON_OFFSET_FILL),(R!==ae||B!==j)&&(R=ae,B=j,a.getReversed()&&(ae=-ae),s.polygonOffset(ae,j))):ye(s.POLYGON_OFFSET_FILL)}function it(I){I?le(s.SCISSOR_TEST):ye(s.SCISSOR_TEST)}function dt(I){I===void 0&&(I=s.TEXTURE0+V-1),ee!==I&&(s.activeTexture(I),ee=I)}function G(I,ae,j){j===void 0&&(ee===null?j=s.TEXTURE0+V-1:j=ee);let me=ue[j];me===void 0&&(me={type:void 0,texture:void 0},ue[j]=me),(me.type!==I||me.texture!==ae)&&(ee!==j&&(s.activeTexture(j),ee=j),s.bindTexture(I,ae||re[I]),me.type=I,me.texture=ae)}function zt(){const I=ue[ee];I!==void 0&&I.type!==void 0&&(s.bindTexture(I.type,null),I.type=void 0,I.texture=void 0)}function Ke(){try{s.compressedTexImage2D(...arguments)}catch(I){He("WebGLState:",I)}}function N(){try{s.compressedTexImage3D(...arguments)}catch(I){He("WebGLState:",I)}}function b(){try{s.texSubImage2D(...arguments)}catch(I){He("WebGLState:",I)}}function Z(){try{s.texSubImage3D(...arguments)}catch(I){He("WebGLState:",I)}}function Q(){try{s.compressedTexSubImage2D(...arguments)}catch(I){He("WebGLState:",I)}}function he(){try{s.compressedTexSubImage3D(...arguments)}catch(I){He("WebGLState:",I)}}function k(){try{s.texStorage2D(...arguments)}catch(I){He("WebGLState:",I)}}function K(){try{s.texStorage3D(...arguments)}catch(I){He("WebGLState:",I)}}function Y(){try{s.texImage2D(...arguments)}catch(I){He("WebGLState:",I)}}function ie(){try{s.texImage3D(...arguments)}catch(I){He("WebGLState:",I)}}function xe(I){return d[I]!==void 0?d[I]:s.getParameter(I)}function O(I,ae){d[I]!==ae&&(s.pixelStorei(I,ae),d[I]=ae)}function z(I){Xe.equals(I)===!1&&(s.scissor(I.x,I.y,I.z,I.w),Xe.copy(I))}function X(I){Oe.equals(I)===!1&&(s.viewport(I.x,I.y,I.z,I.w),Oe.copy(I))}function J(I,ae){let j=c.get(ae);j===void 0&&(j=new WeakMap,c.set(ae,j));let me=j.get(I);me===void 0&&(me=s.getUniformBlockIndex(ae,I.name),j.set(I,me))}function fe(I,ae){const me=c.get(ae).get(I);l.get(ae)!==me&&(s.uniformBlockBinding(ae,me,I.__bindingPointIndex),l.set(ae,me))}function oe(){s.disable(s.BLEND),s.disable(s.CULL_FACE),s.disable(s.DEPTH_TEST),s.disable(s.POLYGON_OFFSET_FILL),s.disable(s.SCISSOR_TEST),s.disable(s.STENCIL_TEST),s.disable(s.SAMPLE_ALPHA_TO_COVERAGE),s.blendEquation(s.FUNC_ADD),s.blendFunc(s.ONE,s.ZERO),s.blendFuncSeparate(s.ONE,s.ZERO,s.ONE,s.ZERO),s.blendColor(0,0,0,0),s.colorMask(!0,!0,!0,!0),s.clearColor(0,0,0,0),s.depthMask(!0),s.depthFunc(s.LESS),a.setReversed(!1),s.clearDepth(1),s.stencilMask(4294967295),s.stencilFunc(s.ALWAYS,0,4294967295),s.stencilOp(s.KEEP,s.KEEP,s.KEEP),s.clearStencil(0),s.cullFace(s.BACK),s.frontFace(s.CCW),s.polygonOffset(0,0),s.activeTexture(s.TEXTURE0),s.bindFramebuffer(s.FRAMEBUFFER,null),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),s.bindFramebuffer(s.READ_FRAMEBUFFER,null),s.useProgram(null),s.lineWidth(1),s.scissor(0,0,s.canvas.width,s.canvas.height),s.viewport(0,0,s.canvas.width,s.canvas.height),s.pixelStorei(s.PACK_ALIGNMENT,4),s.pixelStorei(s.UNPACK_ALIGNMENT,4),s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,!1),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,s.BROWSER_DEFAULT_WEBGL),s.pixelStorei(s.PACK_ROW_LENGTH,0),s.pixelStorei(s.PACK_SKIP_PIXELS,0),s.pixelStorei(s.PACK_SKIP_ROWS,0),s.pixelStorei(s.UNPACK_ROW_LENGTH,0),s.pixelStorei(s.UNPACK_IMAGE_HEIGHT,0),s.pixelStorei(s.UNPACK_SKIP_PIXELS,0),s.pixelStorei(s.UNPACK_SKIP_ROWS,0),s.pixelStorei(s.UNPACK_SKIP_IMAGES,0),h={},d={},ee=null,ue={},u={},f=new WeakMap,m=[],_=null,p=!1,g=null,v=null,M=null,x=null,w=null,S=null,A=null,y=new ge(0,0,0),T=0,C=!1,P=null,D=null,U=null,R=null,B=null,Xe.set(0,0,s.canvas.width,s.canvas.height),Oe.set(0,0,s.canvas.width,s.canvas.height),r.reset(),a.reset(),o.reset()}return{buffers:{color:r,depth:a,stencil:o},enable:le,disable:ye,bindFramebuffer:Ne,drawBuffers:we,useProgram:Ge,setBlending:Ve,setMaterial:tt,setFlipSided:Ye,setCullFace:at,setLineWidth:yt,setPolygonOffset:kt,setScissorTest:it,activeTexture:dt,bindTexture:G,unbindTexture:zt,compressedTexImage2D:Ke,compressedTexImage3D:N,texImage2D:Y,texImage3D:ie,pixelStorei:O,getParameter:xe,updateUBOMapping:J,uniformBlockBinding:fe,texStorage2D:k,texStorage3D:K,texSubImage2D:b,texSubImage3D:Z,compressedTexSubImage2D:Q,compressedTexSubImage3D:he,scissor:z,viewport:X,reset:oe}}function KM(s,e,t,n,i,r,a){const o=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new pe,h=new WeakMap,d=new Set;let u;const f=new WeakMap;let m=!1;try{m=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function _(N,b){return m?new OffscreenCanvas(N,b):Nr("canvas")}function p(N,b,Z){let Q=1;const he=Ke(N);if((he.width>Z||he.height>Z)&&(Q=Z/Math.max(he.width,he.height)),Q<1)if(typeof HTMLImageElement<"u"&&N instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&N instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&N instanceof ImageBitmap||typeof VideoFrame<"u"&&N instanceof VideoFrame){const k=Math.floor(Q*he.width),K=Math.floor(Q*he.height);u===void 0&&(u=_(k,K));const Y=b?_(k,K):u;return Y.width=k,Y.height=K,Y.getContext("2d").drawImage(N,0,0,k,K),Fe("WebGLRenderer: Texture has been resized from ("+he.width+"x"+he.height+") to ("+k+"x"+K+")."),Y}else return"data"in N&&Fe("WebGLRenderer: Image in DataTexture is too big ("+he.width+"x"+he.height+")."),N;return N}function g(N){return N.generateMipmaps}function v(N){s.generateMipmap(N)}function M(N){return N.isWebGLCubeRenderTarget?s.TEXTURE_CUBE_MAP:N.isWebGL3DRenderTarget?s.TEXTURE_3D:N.isWebGLArrayRenderTarget||N.isCompressedArrayTexture?s.TEXTURE_2D_ARRAY:s.TEXTURE_2D}function x(N,b,Z,Q,he,k=!1){if(N!==null){if(s[N]!==void 0)return s[N];Fe("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+N+"'")}let K;Q&&(K=e.get("EXT_texture_norm16"),K||Fe("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let Y=b;if(b===s.RED&&(Z===s.FLOAT&&(Y=s.R32F),Z===s.HALF_FLOAT&&(Y=s.R16F),Z===s.UNSIGNED_BYTE&&(Y=s.R8),Z===s.UNSIGNED_SHORT&&K&&(Y=K.R16_EXT),Z===s.SHORT&&K&&(Y=K.R16_SNORM_EXT)),b===s.RED_INTEGER&&(Z===s.UNSIGNED_BYTE&&(Y=s.R8UI),Z===s.UNSIGNED_SHORT&&(Y=s.R16UI),Z===s.UNSIGNED_INT&&(Y=s.R32UI),Z===s.BYTE&&(Y=s.R8I),Z===s.SHORT&&(Y=s.R16I),Z===s.INT&&(Y=s.R32I)),b===s.RG&&(Z===s.FLOAT&&(Y=s.RG32F),Z===s.HALF_FLOAT&&(Y=s.RG16F),Z===s.UNSIGNED_BYTE&&(Y=s.RG8),Z===s.UNSIGNED_SHORT&&K&&(Y=K.RG16_EXT),Z===s.SHORT&&K&&(Y=K.RG16_SNORM_EXT)),b===s.RG_INTEGER&&(Z===s.UNSIGNED_BYTE&&(Y=s.RG8UI),Z===s.UNSIGNED_SHORT&&(Y=s.RG16UI),Z===s.UNSIGNED_INT&&(Y=s.RG32UI),Z===s.BYTE&&(Y=s.RG8I),Z===s.SHORT&&(Y=s.RG16I),Z===s.INT&&(Y=s.RG32I)),b===s.RGB_INTEGER&&(Z===s.UNSIGNED_BYTE&&(Y=s.RGB8UI),Z===s.UNSIGNED_SHORT&&(Y=s.RGB16UI),Z===s.UNSIGNED_INT&&(Y=s.RGB32UI),Z===s.BYTE&&(Y=s.RGB8I),Z===s.SHORT&&(Y=s.RGB16I),Z===s.INT&&(Y=s.RGB32I)),b===s.RGBA_INTEGER&&(Z===s.UNSIGNED_BYTE&&(Y=s.RGBA8UI),Z===s.UNSIGNED_SHORT&&(Y=s.RGBA16UI),Z===s.UNSIGNED_INT&&(Y=s.RGBA32UI),Z===s.BYTE&&(Y=s.RGBA8I),Z===s.SHORT&&(Y=s.RGBA16I),Z===s.INT&&(Y=s.RGBA32I)),b===s.RGB&&(Z===s.UNSIGNED_SHORT&&K&&(Y=K.RGB16_EXT),Z===s.SHORT&&K&&(Y=K.RGB16_SNORM_EXT),Z===s.UNSIGNED_INT_5_9_9_9_REV&&(Y=s.RGB9_E5),Z===s.UNSIGNED_INT_10F_11F_11F_REV&&(Y=s.R11F_G11F_B10F)),b===s.RGBA){const ie=k?Ha:st.getTransfer(he);Z===s.FLOAT&&(Y=s.RGBA32F),Z===s.HALF_FLOAT&&(Y=s.RGBA16F),Z===s.UNSIGNED_BYTE&&(Y=ie===_t?s.SRGB8_ALPHA8:s.RGBA8),Z===s.UNSIGNED_SHORT&&K&&(Y=K.RGBA16_EXT),Z===s.SHORT&&K&&(Y=K.RGBA16_SNORM_EXT),Z===s.UNSIGNED_SHORT_4_4_4_4&&(Y=s.RGBA4),Z===s.UNSIGNED_SHORT_5_5_5_1&&(Y=s.RGB5_A1)}return(Y===s.R16F||Y===s.R32F||Y===s.RG16F||Y===s.RG32F||Y===s.RGBA16F||Y===s.RGBA32F)&&e.get("EXT_color_buffer_float"),Y}function w(N,b){let Z;return N?b===null||b===li||b===Ts?Z=s.DEPTH24_STENCIL8:b===On?Z=s.DEPTH32F_STENCIL8:b===Pr&&(Z=s.DEPTH24_STENCIL8,Fe("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):b===null||b===li||b===Ts?Z=s.DEPTH_COMPONENT24:b===On?Z=s.DEPTH_COMPONENT32F:b===Pr&&(Z=s.DEPTH_COMPONENT16),Z}function S(N,b){return g(N)===!0||N.isFramebufferTexture&&N.minFilter!==Ht&&N.minFilter!==Gt?Math.log2(Math.max(b.width,b.height))+1:N.mipmaps!==void 0&&N.mipmaps.length>0?N.mipmaps.length:N.isCompressedTexture&&Array.isArray(N.image)?b.mipmaps.length:1}function A(N){const b=N.target;b.removeEventListener("dispose",A),T(b),b.isVideoTexture&&h.delete(b),b.isHTMLTexture&&d.delete(b)}function y(N){const b=N.target;b.removeEventListener("dispose",y),P(b)}function T(N){const b=n.get(N);if(b.__webglInit===void 0)return;const Z=N.source,Q=f.get(Z);if(Q){const he=Q[b.__cacheKey];he.usedTimes--,he.usedTimes===0&&C(N),Object.keys(Q).length===0&&f.delete(Z)}n.remove(N)}function C(N){const b=n.get(N);s.deleteTexture(b.__webglTexture);const Z=N.source,Q=f.get(Z);delete Q[b.__cacheKey],a.memory.textures--}function P(N){const b=n.get(N);if(N.depthTexture&&(N.depthTexture.dispose(),n.remove(N.depthTexture)),N.isWebGLCubeRenderTarget)for(let Q=0;Q<6;Q++){if(Array.isArray(b.__webglFramebuffer[Q]))for(let he=0;he<b.__webglFramebuffer[Q].length;he++)s.deleteFramebuffer(b.__webglFramebuffer[Q][he]);else s.deleteFramebuffer(b.__webglFramebuffer[Q]);b.__webglDepthbuffer&&s.deleteRenderbuffer(b.__webglDepthbuffer[Q])}else{if(Array.isArray(b.__webglFramebuffer))for(let Q=0;Q<b.__webglFramebuffer.length;Q++)s.deleteFramebuffer(b.__webglFramebuffer[Q]);else s.deleteFramebuffer(b.__webglFramebuffer);if(b.__webglDepthbuffer&&s.deleteRenderbuffer(b.__webglDepthbuffer),b.__webglMultisampledFramebuffer&&s.deleteFramebuffer(b.__webglMultisampledFramebuffer),b.__webglColorRenderbuffer)for(let Q=0;Q<b.__webglColorRenderbuffer.length;Q++)b.__webglColorRenderbuffer[Q]&&s.deleteRenderbuffer(b.__webglColorRenderbuffer[Q]);b.__webglDepthRenderbuffer&&s.deleteRenderbuffer(b.__webglDepthRenderbuffer)}const Z=N.textures;for(let Q=0,he=Z.length;Q<he;Q++){const k=n.get(Z[Q]);k.__webglTexture&&(s.deleteTexture(k.__webglTexture),a.memory.textures--),n.remove(Z[Q])}n.remove(N)}let D=0;function U(){D=0}function R(){return D}function B(N){D=N}function V(){const N=D;return N>=i.maxTextures&&Fe("WebGLTextures: Trying to use "+(N+1)+" texture units while this GPU supports only "+i.maxTextures),D+=1,N}function q(N){const b=[];return b.push(N.wrapS),b.push(N.wrapT),b.push(N.wrapR||0),b.push(N.magFilter),b.push(N.minFilter),b.push(N.anisotropy),b.push(N.internalFormat),b.push(N.format),b.push(N.type),b.push(N.generateMipmaps),b.push(N.premultiplyAlpha),b.push(N.flipY),b.push(N.unpackAlignment),b.push(N.colorSpace),b.join()}function se(N,b){const Z=n.get(N);if(N.isVideoTexture&&G(N),N.isRenderTargetTexture===!1&&N.isExternalTexture!==!0&&N.version>0&&Z.__version!==N.version){const Q=N.image;if(Q===null)Fe("WebGLRenderer: Texture marked for update but no image data found.");else if(Q.complete===!1)Fe("WebGLRenderer: Texture marked for update but image is incomplete");else{ye(Z,N,b);return}}else N.isExternalTexture&&(Z.__webglTexture=N.sourceTexture?N.sourceTexture:null);t.bindTexture(s.TEXTURE_2D,Z.__webglTexture,s.TEXTURE0+b)}function $(N,b){const Z=n.get(N);if(N.isRenderTargetTexture===!1&&N.version>0&&Z.__version!==N.version){ye(Z,N,b);return}else N.isExternalTexture&&(Z.__webglTexture=N.sourceTexture?N.sourceTexture:null);t.bindTexture(s.TEXTURE_2D_ARRAY,Z.__webglTexture,s.TEXTURE0+b)}function ee(N,b){const Z=n.get(N);if(N.isRenderTargetTexture===!1&&N.version>0&&Z.__version!==N.version){ye(Z,N,b);return}t.bindTexture(s.TEXTURE_3D,Z.__webglTexture,s.TEXTURE0+b)}function ue(N,b){const Z=n.get(N);if(N.isCubeDepthTexture!==!0&&N.version>0&&Z.__version!==N.version){Ne(Z,N,b);return}t.bindTexture(s.TEXTURE_CUBE_MAP,Z.__webglTexture,s.TEXTURE0+b)}const ve={[bn]:s.REPEAT,[Fn]:s.CLAMP_TO_EDGE,[Da]:s.MIRRORED_REPEAT},Me={[Ht]:s.NEAREST,[Tu]:s.NEAREST_MIPMAP_NEAREST,[Rr]:s.NEAREST_MIPMAP_LINEAR,[Gt]:s.LINEAR,[Ua]:s.LINEAR_MIPMAP_NEAREST,[Ti]:s.LINEAR_MIPMAP_LINEAR},Xe={[Sm]:s.NEVER,[Em]:s.ALWAYS,[wm]:s.LESS,[cc]:s.LEQUAL,[bm]:s.EQUAL,[hc]:s.GEQUAL,[Tm]:s.GREATER,[Am]:s.NOTEQUAL};function Oe(N,b){if(b.type===On&&e.has("OES_texture_float_linear")===!1&&(b.magFilter===Gt||b.magFilter===Ua||b.magFilter===Rr||b.magFilter===Ti||b.minFilter===Gt||b.minFilter===Ua||b.minFilter===Rr||b.minFilter===Ti)&&Fe("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),s.texParameteri(N,s.TEXTURE_WRAP_S,ve[b.wrapS]),s.texParameteri(N,s.TEXTURE_WRAP_T,ve[b.wrapT]),(N===s.TEXTURE_3D||N===s.TEXTURE_2D_ARRAY)&&s.texParameteri(N,s.TEXTURE_WRAP_R,ve[b.wrapR]),s.texParameteri(N,s.TEXTURE_MAG_FILTER,Me[b.magFilter]),s.texParameteri(N,s.TEXTURE_MIN_FILTER,Me[b.minFilter]),b.compareFunction&&(s.texParameteri(N,s.TEXTURE_COMPARE_MODE,s.COMPARE_REF_TO_TEXTURE),s.texParameteri(N,s.TEXTURE_COMPARE_FUNC,Xe[b.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(b.magFilter===Ht||b.minFilter!==Rr&&b.minFilter!==Ti||b.type===On&&e.has("OES_texture_float_linear")===!1)return;if(b.anisotropy>1||n.get(b).__currentAnisotropy){const Z=e.get("EXT_texture_filter_anisotropic");s.texParameterf(N,Z.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(b.anisotropy,i.getMaxAnisotropy())),n.get(b).__currentAnisotropy=b.anisotropy}}}function Ue(N,b){let Z=!1;N.__webglInit===void 0&&(N.__webglInit=!0,b.addEventListener("dispose",A));const Q=b.source;let he=f.get(Q);he===void 0&&(he={},f.set(Q,he));const k=q(b);if(k!==N.__cacheKey){he[k]===void 0&&(he[k]={texture:s.createTexture(),usedTimes:0},a.memory.textures++,Z=!0),he[k].usedTimes++;const K=he[N.__cacheKey];K!==void 0&&(he[N.__cacheKey].usedTimes--,K.usedTimes===0&&C(b)),N.__cacheKey=k,N.__webglTexture=he[k].texture}return Z}function re(N,b,Z){return Math.floor(Math.floor(N/Z)/b)}function le(N,b,Z,Q){const k=N.updateRanges;if(k.length===0)t.texSubImage2D(s.TEXTURE_2D,0,0,0,b.width,b.height,Z,Q,b.data);else{k.sort((O,z)=>O.start-z.start);let K=0;for(let O=1;O<k.length;O++){const z=k[K],X=k[O],J=z.start+z.count,fe=re(X.start,b.width,4),oe=re(z.start,b.width,4);X.start<=J+1&&fe===oe&&re(X.start+X.count-1,b.width,4)===fe?z.count=Math.max(z.count,X.start+X.count-z.start):(++K,k[K]=X)}k.length=K+1;const Y=t.getParameter(s.UNPACK_ROW_LENGTH),ie=t.getParameter(s.UNPACK_SKIP_PIXELS),xe=t.getParameter(s.UNPACK_SKIP_ROWS);t.pixelStorei(s.UNPACK_ROW_LENGTH,b.width);for(let O=0,z=k.length;O<z;O++){const X=k[O],J=Math.floor(X.start/4),fe=Math.ceil(X.count/4),oe=J%b.width,I=Math.floor(J/b.width),ae=fe,j=1;t.pixelStorei(s.UNPACK_SKIP_PIXELS,oe),t.pixelStorei(s.UNPACK_SKIP_ROWS,I),t.texSubImage2D(s.TEXTURE_2D,0,oe,I,ae,j,Z,Q,b.data)}N.clearUpdateRanges(),t.pixelStorei(s.UNPACK_ROW_LENGTH,Y),t.pixelStorei(s.UNPACK_SKIP_PIXELS,ie),t.pixelStorei(s.UNPACK_SKIP_ROWS,xe)}}function ye(N,b,Z){let Q=s.TEXTURE_2D;(b.isDataArrayTexture||b.isCompressedArrayTexture)&&(Q=s.TEXTURE_2D_ARRAY),b.isData3DTexture&&(Q=s.TEXTURE_3D);const he=Ue(N,b),k=b.source;t.bindTexture(Q,N.__webglTexture,s.TEXTURE0+Z);const K=n.get(k);if(k.version!==K.__version||he===!0){if(t.activeTexture(s.TEXTURE0+Z),(typeof ImageBitmap<"u"&&b.image instanceof ImageBitmap)===!1){const j=st.getPrimaries(st.workingColorSpace),me=b.colorSpace===Ei?null:st.getPrimaries(b.colorSpace),_e=b.colorSpace===Ei||j===me?s.NONE:s.BROWSER_DEFAULT_WEBGL;t.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,b.flipY),t.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),t.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,_e)}t.pixelStorei(s.UNPACK_ALIGNMENT,b.unpackAlignment);let ie=p(b.image,!1,i.maxTextureSize);ie=zt(b,ie);const xe=r.convert(b.format,b.colorSpace),O=r.convert(b.type);let z=x(b.internalFormat,xe,O,b.normalized,b.colorSpace,b.isVideoTexture);Oe(Q,b);let X;const J=b.mipmaps,fe=b.isVideoTexture!==!0,oe=K.__version===void 0||he===!0,I=k.dataReady,ae=S(b,ie);if(b.isDepthTexture)z=w(b.format===Vi,b.type),oe&&(fe?t.texStorage2D(s.TEXTURE_2D,1,z,ie.width,ie.height):t.texImage2D(s.TEXTURE_2D,0,z,ie.width,ie.height,0,xe,O,null));else if(b.isDataTexture)if(J.length>0){fe&&oe&&t.texStorage2D(s.TEXTURE_2D,ae,z,J[0].width,J[0].height);for(let j=0,me=J.length;j<me;j++)X=J[j],fe?I&&t.texSubImage2D(s.TEXTURE_2D,j,0,0,X.width,X.height,xe,O,X.data):t.texImage2D(s.TEXTURE_2D,j,z,X.width,X.height,0,xe,O,X.data);b.generateMipmaps=!1}else fe?(oe&&t.texStorage2D(s.TEXTURE_2D,ae,z,ie.width,ie.height),I&&le(b,ie,xe,O)):t.texImage2D(s.TEXTURE_2D,0,z,ie.width,ie.height,0,xe,O,ie.data);else if(b.isCompressedTexture)if(b.isCompressedArrayTexture){fe&&oe&&t.texStorage3D(s.TEXTURE_2D_ARRAY,ae,z,J[0].width,J[0].height,ie.depth);for(let j=0,me=J.length;j<me;j++)if(X=J[j],b.format!==Cn)if(xe!==null)if(fe){if(I)if(b.layerUpdates.size>0){const _e=pd(X.width,X.height,b.format,b.type);for(const de of b.layerUpdates){const Se=X.data.subarray(de*_e/X.data.BYTES_PER_ELEMENT,(de+1)*_e/X.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,j,0,0,de,X.width,X.height,1,xe,Se)}}else t.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,j,0,0,0,X.width,X.height,ie.depth,xe,X.data)}else t.compressedTexImage3D(s.TEXTURE_2D_ARRAY,j,z,X.width,X.height,ie.depth,0,X.data,0,0);else Fe("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else fe?I&&t.texSubImage3D(s.TEXTURE_2D_ARRAY,j,0,0,0,X.width,X.height,ie.depth,xe,O,X.data):t.texImage3D(s.TEXTURE_2D_ARRAY,j,z,X.width,X.height,ie.depth,0,xe,O,X.data);b.layerUpdates.size>0&&b.clearLayerUpdates()}else{fe&&oe&&t.texStorage2D(s.TEXTURE_2D,ae,z,J[0].width,J[0].height);for(let j=0,me=J.length;j<me;j++)X=J[j],b.format!==Cn?xe!==null?fe?I&&t.compressedTexSubImage2D(s.TEXTURE_2D,j,0,0,X.width,X.height,xe,X.data):t.compressedTexImage2D(s.TEXTURE_2D,j,z,X.width,X.height,0,X.data):Fe("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):fe?I&&t.texSubImage2D(s.TEXTURE_2D,j,0,0,X.width,X.height,xe,O,X.data):t.texImage2D(s.TEXTURE_2D,j,z,X.width,X.height,0,xe,O,X.data)}else if(b.isDataArrayTexture)if(fe){if(oe&&t.texStorage3D(s.TEXTURE_2D_ARRAY,ae,z,ie.width,ie.height,ie.depth),I)if(b.layerUpdates.size>0){const j=pd(ie.width,ie.height,b.format,b.type);for(const me of b.layerUpdates){const _e=ie.data.subarray(me*j/ie.data.BYTES_PER_ELEMENT,(me+1)*j/ie.data.BYTES_PER_ELEMENT);t.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,me,ie.width,ie.height,1,xe,O,_e)}b.clearLayerUpdates()}else t.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,0,ie.width,ie.height,ie.depth,xe,O,ie.data)}else t.texImage3D(s.TEXTURE_2D_ARRAY,0,z,ie.width,ie.height,ie.depth,0,xe,O,ie.data);else if(b.isData3DTexture)fe?(oe&&t.texStorage3D(s.TEXTURE_3D,ae,z,ie.width,ie.height,ie.depth),I&&t.texSubImage3D(s.TEXTURE_3D,0,0,0,0,ie.width,ie.height,ie.depth,xe,O,ie.data)):t.texImage3D(s.TEXTURE_3D,0,z,ie.width,ie.height,ie.depth,0,xe,O,ie.data);else if(b.isFramebufferTexture){if(oe)if(fe)t.texStorage2D(s.TEXTURE_2D,ae,z,ie.width,ie.height);else{let j=ie.width,me=ie.height;for(let _e=0;_e<ae;_e++)t.texImage2D(s.TEXTURE_2D,_e,z,j,me,0,xe,O,null),j>>=1,me>>=1}}else if(b.isHTMLTexture){if("texElementImage2D"in s){const j=s.canvas;if(j.hasAttribute("layoutsubtree")||j.setAttribute("layoutsubtree","true"),ie.parentNode!==j){j.appendChild(ie),d.add(b),j.onpaint=me=>{const _e=me.changedElements;for(const de of d)_e.includes(de.image)&&(de.needsUpdate=!0)},j.requestPaint();return}if(s.texElementImage2D.length===3)s.texElementImage2D(s.TEXTURE_2D,s.RGBA8,ie);else{const _e=s.RGBA,de=s.RGBA,Se=s.UNSIGNED_BYTE;s.texElementImage2D(s.TEXTURE_2D,0,_e,de,Se,ie)}s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MIN_FILTER,s.LINEAR),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_S,s.CLAMP_TO_EDGE),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_T,s.CLAMP_TO_EDGE)}}else if(J.length>0){if(fe&&oe){const j=Ke(J[0]);t.texStorage2D(s.TEXTURE_2D,ae,z,j.width,j.height)}for(let j=0,me=J.length;j<me;j++)X=J[j],fe?I&&t.texSubImage2D(s.TEXTURE_2D,j,0,0,xe,O,X):t.texImage2D(s.TEXTURE_2D,j,z,xe,O,X);b.generateMipmaps=!1}else if(fe){if(oe){const j=Ke(ie);t.texStorage2D(s.TEXTURE_2D,ae,z,j.width,j.height)}I&&t.texSubImage2D(s.TEXTURE_2D,0,0,0,xe,O,ie)}else t.texImage2D(s.TEXTURE_2D,0,z,xe,O,ie);g(b)&&v(Q),K.__version=k.version,b.onUpdate&&b.onUpdate(b)}N.__version=b.version}function Ne(N,b,Z){if(b.image.length!==6)return;const Q=Ue(N,b),he=b.source;t.bindTexture(s.TEXTURE_CUBE_MAP,N.__webglTexture,s.TEXTURE0+Z);const k=n.get(he);if(he.version!==k.__version||Q===!0){t.activeTexture(s.TEXTURE0+Z);const K=st.getPrimaries(st.workingColorSpace),Y=b.colorSpace===Ei?null:st.getPrimaries(b.colorSpace),ie=b.colorSpace===Ei||K===Y?s.NONE:s.BROWSER_DEFAULT_WEBGL;t.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,b.flipY),t.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),t.pixelStorei(s.UNPACK_ALIGNMENT,b.unpackAlignment),t.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,ie);const xe=b.isCompressedTexture||b.image[0].isCompressedTexture,O=b.image[0]&&b.image[0].isDataTexture,z=[];for(let de=0;de<6;de++)!xe&&!O?z[de]=p(b.image[de],!0,i.maxCubemapSize):z[de]=O?b.image[de].image:b.image[de],z[de]=zt(b,z[de]);const X=z[0],J=r.convert(b.format,b.colorSpace),fe=r.convert(b.type),oe=x(b.internalFormat,J,fe,b.normalized,b.colorSpace),I=b.isVideoTexture!==!0,ae=k.__version===void 0||Q===!0,j=he.dataReady;let me=S(b,X);Oe(s.TEXTURE_CUBE_MAP,b);let _e;if(xe){I&&ae&&t.texStorage2D(s.TEXTURE_CUBE_MAP,me,oe,X.width,X.height);for(let de=0;de<6;de++){_e=z[de].mipmaps;for(let Se=0;Se<_e.length;Se++){const be=_e[Se];b.format!==Cn?J!==null?I?j&&t.compressedTexSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+de,Se,0,0,be.width,be.height,J,be.data):t.compressedTexImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+de,Se,oe,be.width,be.height,0,be.data):Fe("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):I?j&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+de,Se,0,0,be.width,be.height,J,fe,be.data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+de,Se,oe,be.width,be.height,0,J,fe,be.data)}}}else{if(_e=b.mipmaps,I&&ae){_e.length>0&&me++;const de=Ke(z[0]);t.texStorage2D(s.TEXTURE_CUBE_MAP,me,oe,de.width,de.height)}for(let de=0;de<6;de++)if(O){I?j&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+de,0,0,0,z[de].width,z[de].height,J,fe,z[de].data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+de,0,oe,z[de].width,z[de].height,0,J,fe,z[de].data);for(let Se=0;Se<_e.length;Se++){const ft=_e[Se].image[de].image;I?j&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+de,Se+1,0,0,ft.width,ft.height,J,fe,ft.data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+de,Se+1,oe,ft.width,ft.height,0,J,fe,ft.data)}}else{I?j&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+de,0,0,0,J,fe,z[de]):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+de,0,oe,J,fe,z[de]);for(let Se=0;Se<_e.length;Se++){const be=_e[Se];I?j&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+de,Se+1,0,0,J,fe,be.image[de]):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+de,Se+1,oe,J,fe,be.image[de])}}}g(b)&&v(s.TEXTURE_CUBE_MAP),k.__version=he.version,b.onUpdate&&b.onUpdate(b)}N.__version=b.version}function we(N,b,Z,Q,he,k){const K=r.convert(Z.format,Z.colorSpace),Y=r.convert(Z.type),ie=x(Z.internalFormat,K,Y,Z.normalized,Z.colorSpace),xe=n.get(b),O=n.get(Z);if(O.__renderTarget=b,!xe.__hasExternalTextures){const z=Math.max(1,b.width>>k),X=Math.max(1,b.height>>k);he===s.TEXTURE_3D||he===s.TEXTURE_2D_ARRAY?t.texImage3D(he,k,ie,z,X,b.depth,0,K,Y,null):t.texImage2D(he,k,ie,z,X,0,K,Y,null)}t.bindFramebuffer(s.FRAMEBUFFER,N),dt(b)?o.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,Q,he,O.__webglTexture,0,it(b)):(he===s.TEXTURE_2D||he>=s.TEXTURE_CUBE_MAP_POSITIVE_X&&he<=s.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&s.framebufferTexture2D(s.FRAMEBUFFER,Q,he,O.__webglTexture,k),t.bindFramebuffer(s.FRAMEBUFFER,null)}function Ge(N,b,Z){if(s.bindRenderbuffer(s.RENDERBUFFER,N),b.depthBuffer){const Q=b.depthTexture,he=Q&&Q.isDepthTexture?Q.type:null,k=w(b.stencilBuffer,he),K=b.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;dt(b)?o.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,it(b),k,b.width,b.height):Z?s.renderbufferStorageMultisample(s.RENDERBUFFER,it(b),k,b.width,b.height):s.renderbufferStorage(s.RENDERBUFFER,k,b.width,b.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,K,s.RENDERBUFFER,N)}else{const Q=b.textures;for(let he=0;he<Q.length;he++){const k=Q[he],K=r.convert(k.format,k.colorSpace),Y=r.convert(k.type),ie=x(k.internalFormat,K,Y,k.normalized,k.colorSpace);dt(b)?o.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,it(b),ie,b.width,b.height):Z?s.renderbufferStorageMultisample(s.RENDERBUFFER,it(b),ie,b.width,b.height):s.renderbufferStorage(s.RENDERBUFFER,ie,b.width,b.height)}}s.bindRenderbuffer(s.RENDERBUFFER,null)}function Et(N,b,Z){const Q=b.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(s.FRAMEBUFFER,N),!(b.depthTexture&&b.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");const he=n.get(b.depthTexture);if(he.__renderTarget=b,(!he.__webglTexture||b.depthTexture.image.width!==b.width||b.depthTexture.image.height!==b.height)&&(b.depthTexture.image.width=b.width,b.depthTexture.image.height=b.height,b.depthTexture.needsUpdate=!0),Q){if(he.__webglInit===void 0&&(he.__webglInit=!0,b.depthTexture.addEventListener("dispose",A)),he.__webglTexture===void 0){he.__webglTexture=s.createTexture(),t.bindTexture(s.TEXTURE_CUBE_MAP,he.__webglTexture),Oe(s.TEXTURE_CUBE_MAP,b.depthTexture);const xe=r.convert(b.depthTexture.format),O=r.convert(b.depthTexture.type);let z;b.depthTexture.format===Ai?z=s.DEPTH_COMPONENT24:b.depthTexture.format===Vi&&(z=s.DEPTH24_STENCIL8);for(let X=0;X<6;X++)s.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+X,0,z,b.width,b.height,0,xe,O,null)}}else se(b.depthTexture,0);const k=he.__webglTexture,K=it(b),Y=Q?s.TEXTURE_CUBE_MAP_POSITIVE_X+Z:s.TEXTURE_2D,ie=b.depthTexture.format===Vi?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;if(b.depthTexture.format===Ai)dt(b)?o.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,ie,Y,k,0,K):s.framebufferTexture2D(s.FRAMEBUFFER,ie,Y,k,0);else if(b.depthTexture.format===Vi)dt(b)?o.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,ie,Y,k,0,K):s.framebufferTexture2D(s.FRAMEBUFFER,ie,Y,k,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function qe(N){const b=n.get(N),Z=N.isWebGLCubeRenderTarget===!0;if(b.__boundDepthTexture!==N.depthTexture){const Q=N.depthTexture;if(b.__depthDisposeCallback&&b.__depthDisposeCallback(),Q){const he=()=>{delete b.__boundDepthTexture,delete b.__depthDisposeCallback,Q.removeEventListener("dispose",he)};Q.addEventListener("dispose",he),b.__depthDisposeCallback=he}b.__boundDepthTexture=Q}if(N.depthTexture&&!b.__autoAllocateDepthBuffer)if(Z)for(let Q=0;Q<6;Q++)Et(b.__webglFramebuffer[Q],N,Q);else{const Q=N.texture.mipmaps;Q&&Q.length>0?Et(b.__webglFramebuffer[0],N,0):Et(b.__webglFramebuffer,N,0)}else if(Z){b.__webglDepthbuffer=[];for(let Q=0;Q<6;Q++)if(t.bindFramebuffer(s.FRAMEBUFFER,b.__webglFramebuffer[Q]),b.__webglDepthbuffer[Q]===void 0)b.__webglDepthbuffer[Q]=s.createRenderbuffer(),Ge(b.__webglDepthbuffer[Q],N,!1);else{const he=N.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,k=b.__webglDepthbuffer[Q];s.bindRenderbuffer(s.RENDERBUFFER,k),s.framebufferRenderbuffer(s.FRAMEBUFFER,he,s.RENDERBUFFER,k)}}else{const Q=N.texture.mipmaps;if(Q&&Q.length>0?t.bindFramebuffer(s.FRAMEBUFFER,b.__webglFramebuffer[0]):t.bindFramebuffer(s.FRAMEBUFFER,b.__webglFramebuffer),b.__webglDepthbuffer===void 0)b.__webglDepthbuffer=s.createRenderbuffer(),Ge(b.__webglDepthbuffer,N,!1);else{const he=N.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,k=b.__webglDepthbuffer;s.bindRenderbuffer(s.RENDERBUFFER,k),s.framebufferRenderbuffer(s.FRAMEBUFFER,he,s.RENDERBUFFER,k)}}t.bindFramebuffer(s.FRAMEBUFFER,null)}function Ve(N,b,Z){const Q=n.get(N);b!==void 0&&we(Q.__webglFramebuffer,N,N.texture,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,0),Z!==void 0&&qe(N)}function tt(N){const b=N.texture,Z=n.get(N),Q=n.get(b);N.addEventListener("dispose",y);const he=N.textures,k=N.isWebGLCubeRenderTarget===!0,K=he.length>1;if(K||(Q.__webglTexture===void 0&&(Q.__webglTexture=s.createTexture()),Q.__version=b.version,a.memory.textures++),k){Z.__webglFramebuffer=[];for(let Y=0;Y<6;Y++)if(b.mipmaps&&b.mipmaps.length>0){Z.__webglFramebuffer[Y]=[];for(let ie=0;ie<b.mipmaps.length;ie++)Z.__webglFramebuffer[Y][ie]=s.createFramebuffer()}else Z.__webglFramebuffer[Y]=s.createFramebuffer()}else{if(b.mipmaps&&b.mipmaps.length>0){Z.__webglFramebuffer=[];for(let Y=0;Y<b.mipmaps.length;Y++)Z.__webglFramebuffer[Y]=s.createFramebuffer()}else Z.__webglFramebuffer=s.createFramebuffer();if(K)for(let Y=0,ie=he.length;Y<ie;Y++){const xe=n.get(he[Y]);xe.__webglTexture===void 0&&(xe.__webglTexture=s.createTexture(),a.memory.textures++)}if(N.samples>0&&dt(N)===!1){Z.__webglMultisampledFramebuffer=s.createFramebuffer(),Z.__webglColorRenderbuffer=[],t.bindFramebuffer(s.FRAMEBUFFER,Z.__webglMultisampledFramebuffer);for(let Y=0;Y<he.length;Y++){const ie=he[Y];Z.__webglColorRenderbuffer[Y]=s.createRenderbuffer(),s.bindRenderbuffer(s.RENDERBUFFER,Z.__webglColorRenderbuffer[Y]);const xe=r.convert(ie.format,ie.colorSpace),O=r.convert(ie.type),z=x(ie.internalFormat,xe,O,ie.normalized,ie.colorSpace,N.isXRRenderTarget===!0),X=it(N);s.renderbufferStorageMultisample(s.RENDERBUFFER,X,z,N.width,N.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+Y,s.RENDERBUFFER,Z.__webglColorRenderbuffer[Y])}s.bindRenderbuffer(s.RENDERBUFFER,null),N.depthBuffer&&(Z.__webglDepthRenderbuffer=s.createRenderbuffer(),Ge(Z.__webglDepthRenderbuffer,N,!0)),t.bindFramebuffer(s.FRAMEBUFFER,null)}}if(k){t.bindTexture(s.TEXTURE_CUBE_MAP,Q.__webglTexture),Oe(s.TEXTURE_CUBE_MAP,b);for(let Y=0;Y<6;Y++)if(b.mipmaps&&b.mipmaps.length>0)for(let ie=0;ie<b.mipmaps.length;ie++)we(Z.__webglFramebuffer[Y][ie],N,b,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+Y,ie);else we(Z.__webglFramebuffer[Y],N,b,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0);g(b)&&v(s.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(K){for(let Y=0,ie=he.length;Y<ie;Y++){const xe=he[Y],O=n.get(xe);let z=s.TEXTURE_2D;(N.isWebGL3DRenderTarget||N.isWebGLArrayRenderTarget)&&(z=N.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),t.bindTexture(z,O.__webglTexture),Oe(z,xe),we(Z.__webglFramebuffer,N,xe,s.COLOR_ATTACHMENT0+Y,z,0),g(xe)&&v(z)}t.unbindTexture()}else{let Y=s.TEXTURE_2D;if((N.isWebGL3DRenderTarget||N.isWebGLArrayRenderTarget)&&(Y=N.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),t.bindTexture(Y,Q.__webglTexture),Oe(Y,b),b.mipmaps&&b.mipmaps.length>0)for(let ie=0;ie<b.mipmaps.length;ie++)we(Z.__webglFramebuffer[ie],N,b,s.COLOR_ATTACHMENT0,Y,ie);else we(Z.__webglFramebuffer,N,b,s.COLOR_ATTACHMENT0,Y,0);g(b)&&v(Y),t.unbindTexture()}N.depthBuffer&&qe(N)}function Ye(N){const b=N.textures;for(let Z=0,Q=b.length;Z<Q;Z++){const he=b[Z];if(g(he)){const k=M(N),K=n.get(he).__webglTexture;t.bindTexture(k,K),v(k),t.unbindTexture()}}}const at=[],yt=[];function kt(N){if(N.samples>0){if(dt(N)===!1){const b=N.textures,Z=N.width,Q=N.height;let he=s.COLOR_BUFFER_BIT;const k=N.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,K=n.get(N),Y=b.length>1;if(Y)for(let xe=0;xe<b.length;xe++)t.bindFramebuffer(s.FRAMEBUFFER,K.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+xe,s.RENDERBUFFER,null),t.bindFramebuffer(s.FRAMEBUFFER,K.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+xe,s.TEXTURE_2D,null,0);t.bindFramebuffer(s.READ_FRAMEBUFFER,K.__webglMultisampledFramebuffer);const ie=N.texture.mipmaps;ie&&ie.length>0?t.bindFramebuffer(s.DRAW_FRAMEBUFFER,K.__webglFramebuffer[0]):t.bindFramebuffer(s.DRAW_FRAMEBUFFER,K.__webglFramebuffer);for(let xe=0;xe<b.length;xe++){if(N.resolveDepthBuffer&&(N.depthBuffer&&(he|=s.DEPTH_BUFFER_BIT),N.stencilBuffer&&N.resolveStencilBuffer&&(he|=s.STENCIL_BUFFER_BIT)),Y){s.framebufferRenderbuffer(s.READ_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.RENDERBUFFER,K.__webglColorRenderbuffer[xe]);const O=n.get(b[xe]).__webglTexture;s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,O,0)}s.blitFramebuffer(0,0,Z,Q,0,0,Z,Q,he,s.NEAREST),l===!0&&(at.length=0,yt.length=0,at.push(s.COLOR_ATTACHMENT0+xe),N.depthBuffer&&N.storeMultisampledDepthBuffer===!1&&(at.push(k),yt.push(k),s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,yt)),s.invalidateFramebuffer(s.READ_FRAMEBUFFER,at))}if(t.bindFramebuffer(s.READ_FRAMEBUFFER,null),t.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),Y)for(let xe=0;xe<b.length;xe++){t.bindFramebuffer(s.FRAMEBUFFER,K.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+xe,s.RENDERBUFFER,K.__webglColorRenderbuffer[xe]);const O=n.get(b[xe]).__webglTexture;t.bindFramebuffer(s.FRAMEBUFFER,K.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+xe,s.TEXTURE_2D,O,0)}t.bindFramebuffer(s.DRAW_FRAMEBUFFER,K.__webglMultisampledFramebuffer)}else if(N.depthBuffer&&N.storeMultisampledDepthBuffer===!1&&l){const b=N.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,[b])}}}function it(N){return Math.min(i.maxSamples,N.samples)}function dt(N){const b=n.get(N);return N.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&b.__useRenderToTexture!==!1}function G(N){const b=a.render.frame;h.get(N)!==b&&(h.set(N,b),N.update())}function zt(N,b){const Z=N.colorSpace,Q=N.format,he=N.type;return N.isCompressedTexture===!0||N.isVideoTexture===!0||Z!==Rn&&Z!==Ei&&(st.getTransfer(Z)===_t?(Q!==Cn||he!==vn)&&Fe("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):He("WebGLTextures: Unsupported texture color space:",Z)),b}function Ke(N){return typeof HTMLImageElement<"u"&&N instanceof HTMLImageElement?(c.width=N.naturalWidth||N.width,c.height=N.naturalHeight||N.height):typeof VideoFrame<"u"&&N instanceof VideoFrame?(c.width=N.displayWidth,c.height=N.displayHeight):(c.width=N.width,c.height=N.height),c}this.allocateTextureUnit=V,this.resetTextureUnits=U,this.getTextureUnits=R,this.setTextureUnits=B,this.setTexture2D=se,this.setTexture2DArray=$,this.setTexture3D=ee,this.setTextureCube=ue,this.rebindTextures=Ve,this.setupRenderTarget=tt,this.updateRenderTargetMipmap=Ye,this.updateMultisampleRenderTarget=kt,this.setupDepthRenderbuffer=qe,this.setupFrameBufferTexture=we,this.useMultisampledRTT=dt,this.isReversedDepthBuffer=function(){return t.buffers.depth.getReversed()}}function JM(s,e){function t(n,i=Ei){let r;const a=st.getTransfer(i);if(n===vn)return s.UNSIGNED_BYTE;if(n===Tl)return s.UNSIGNED_SHORT_4_4_4_4;if(n===Al)return s.UNSIGNED_SHORT_5_5_5_1;if(n===Cu)return s.UNSIGNED_INT_5_9_9_9_REV;if(n===Ru)return s.UNSIGNED_INT_10F_11F_11F_REV;if(n===Au)return s.BYTE;if(n===Eu)return s.SHORT;if(n===Pr)return s.UNSIGNED_SHORT;if(n===bl)return s.INT;if(n===li)return s.UNSIGNED_INT;if(n===On)return s.FLOAT;if(n===un)return s.HALF_FLOAT;if(n===Pu)return s.ALPHA;if(n===Iu)return s.RGB;if(n===Cn)return s.RGBA;if(n===Ai)return s.DEPTH_COMPONENT;if(n===Vi)return s.DEPTH_STENCIL;if(n===Na)return s.RED;if(n===El)return s.RED_INTEGER;if(n===is)return s.RG;if(n===Cl)return s.RG_INTEGER;if(n===Rl)return s.RGBA_INTEGER;if(n===za||n===Fa||n===Oa||n===Ba)if(a===_t)if(r=e.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===za)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Fa)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Oa)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Ba)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=e.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===za)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Fa)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Oa)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Ba)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===Pl||n===Il||n===Ll||n===Dl)if(r=e.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===Pl)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Il)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===Ll)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===Dl)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===Ul||n===Nl||n===zl||n===Fl||n===Ol||n===ka||n===Bl)if(r=e.get("WEBGL_compressed_texture_etc"),r!==null){if(n===Ul||n===Nl)return a===_t?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===zl)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===Fl)return r.COMPRESSED_R11_EAC;if(n===Ol)return r.COMPRESSED_SIGNED_R11_EAC;if(n===ka)return r.COMPRESSED_RG11_EAC;if(n===Bl)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===kl||n===Vl||n===Hl||n===Gl||n===Wl||n===Xl||n===Yl||n===ql||n===Zl||n===$l||n===Kl||n===Jl||n===jl||n===Ql)if(r=e.get("WEBGL_compressed_texture_astc"),r!==null){if(n===kl)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===Vl)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===Hl)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===Gl)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===Wl)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===Xl)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===Yl)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===ql)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===Zl)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===$l)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===Kl)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===Jl)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===jl)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===Ql)return a===_t?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===ec||n===tc||n===nc)if(r=e.get("EXT_texture_compression_bptc"),r!==null){if(n===ec)return a===_t?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===tc)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===nc)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===ic||n===sc||n===Va||n===rc)if(r=e.get("EXT_texture_compression_rgtc"),r!==null){if(n===ic)return r.COMPRESSED_RED_RGTC1_EXT;if(n===sc)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===Va)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===rc)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===Ts?s.UNSIGNED_INT_24_8:s[n]!==void 0?s[n]:null}return{convert:t}}const jM=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,QM=`
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

}`;class ey{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){const n=new Pf(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){const t=e.cameras[0].viewport,n=new gt({vertexShader:jM,fragmentShader:QM,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new $e(new ni(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class ty extends Gi{constructor(e,t){super();const n=this;let i=null,r=1,a=null,o="local-floor",l=1,c=null,h=null,d=null,u=null,f=null,m=null;const _=typeof XRWebGLBinding<"u",p=new ey,g={},v=t.getContextAttributes();let M=null,x=null;const w=[],S=[],A=new pe;let y=null,T=null;const C=new yn;C.viewport=new Mt;const P=new yn;P.viewport=new Mt;const D=[C,P],U=new Pg;let R=null,B=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(re){let le=w[re];return le===void 0&&(le=new _c,w[re]=le),le.getTargetRaySpace()},this.getControllerGrip=function(re){let le=w[re];return le===void 0&&(le=new _c,w[re]=le),le.getGripSpace()},this.getHand=function(re){let le=w[re];return le===void 0&&(le=new _c,w[re]=le),le.getHandSpace()};function V(re){const le=S.indexOf(re.inputSource);if(le===-1)return;const ye=w[le];ye!==void 0&&(ye.update(re.inputSource,re.frame,c||a),ye.dispatchEvent({type:re.type,data:re.inputSource}))}function q(){i.removeEventListener("select",V),i.removeEventListener("selectstart",V),i.removeEventListener("selectend",V),i.removeEventListener("squeeze",V),i.removeEventListener("squeezestart",V),i.removeEventListener("squeezeend",V),i.removeEventListener("end",q),i.removeEventListener("inputsourceschange",se);for(let re=0;re<w.length;re++){const le=S[re];le!==null&&(S[re]=null,w[re].disconnect(le))}R=null,B=null,p.reset();for(const re in g)delete g[re];if(e.setRenderTarget(M),f=null,u=null,d=null,i=null,x=null,Ue.stop(),n.isPresenting=!1,e.setPixelRatio(y),e.setSize(A.width,A.height,!1),T!==null){const re=T.camera;re.fov=T.fov,re.zoom=T.zoom,re.updateProjectionMatrix(),T=null}n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(re){r=re,n.isPresenting===!0&&Fe("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(re){o=re,n.isPresenting===!0&&Fe("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(re){c=re},this.getBaseLayer=function(){return u!==null?u:f},this.getBinding=function(){return d===null&&_&&(d=new XRWebGLBinding(i,t)),d},this.getFrame=function(){return m},this.getSession=function(){return i},this.setSession=async function(re){if(i=re,i!==null){if(M=e.getRenderTarget(),i.addEventListener("select",V),i.addEventListener("selectstart",V),i.addEventListener("selectend",V),i.addEventListener("squeeze",V),i.addEventListener("squeezestart",V),i.addEventListener("squeezeend",V),i.addEventListener("end",q),i.addEventListener("inputsourceschange",se),v.xrCompatible!==!0&&await t.makeXRCompatible(),y=e.getPixelRatio(),e.getSize(A),_&&"createProjectionLayer"in XRWebGLBinding.prototype){let ye=null,Ne=null,we=null;v.depth&&(we=v.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,ye=v.stencil?Vi:Ai,Ne=v.stencil?Ts:li);const Ge={colorFormat:t.RGBA8,depthFormat:we,scaleFactor:r};d=this.getBinding(),u=d.createProjectionLayer(Ge),i.updateRenderState({layers:[u]}),e.setPixelRatio(1),e.setSize(u.textureWidth,u.textureHeight,!1),x=new on(u.textureWidth,u.textureHeight,{format:Cn,type:vn,depthTexture:new Ys(u.textureWidth,u.textureHeight,Ne,void 0,void 0,void 0,void 0,void 0,void 0,ye),stencilBuffer:v.stencil,colorSpace:e.outputColorSpace,samples:v.antialias?4:0,resolveDepthBuffer:u.ignoreDepthValues===!1,resolveStencilBuffer:u.ignoreDepthValues===!1,storeMultisampledDepthBuffer:u.ignoreDepthValues===!1,storeMultisampledStencilBuffer:u.ignoreDepthValues===!1})}else{const ye={antialias:v.antialias,alpha:!0,depth:v.depth,stencil:v.stencil,framebufferScaleFactor:r};f=new XRWebGLLayer(i,t,ye),i.updateRenderState({baseLayer:f}),e.setPixelRatio(1),e.setSize(f.framebufferWidth,f.framebufferHeight,!1),x=new on(f.framebufferWidth,f.framebufferHeight,{format:Cn,type:vn,colorSpace:e.outputColorSpace,stencilBuffer:v.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1,storeMultisampledDepthBuffer:f.ignoreDepthValues===!1,storeMultisampledStencilBuffer:f.ignoreDepthValues===!1})}x.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await i.requestReferenceSpace(o),Ue.setContext(i),Ue.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode},this.getDepthTexture=function(){return p.getDepthTexture()};function se(re){for(let le=0;le<re.removed.length;le++){const ye=re.removed[le],Ne=S.indexOf(ye);Ne>=0&&(S[Ne]=null,w[Ne].disconnect(ye))}for(let le=0;le<re.added.length;le++){const ye=re.added[le];let Ne=S.indexOf(ye);if(Ne===-1){for(let Ge=0;Ge<w.length;Ge++)if(Ge>=S.length){S.push(ye),Ne=Ge;break}else if(S[Ge]===null){S[Ge]=ye,Ne=Ge;break}if(Ne===-1)break}const we=w[Ne];we&&we.connect(ye)}}const $=new L,ee=new L;function ue(re,le,ye){$.setFromMatrixPosition(le.matrixWorld),ee.setFromMatrixPosition(ye.matrixWorld);const Ne=$.distanceTo(ee),we=le.projectionMatrix.elements,Ge=ye.projectionMatrix.elements,Et=we[14]/(we[10]-1),qe=we[14]/(we[10]+1),Ve=(we[9]+1)/we[5],tt=(we[9]-1)/we[5],Ye=(we[8]-1)/we[0],at=(Ge[8]+1)/Ge[0],yt=Et*Ye,kt=Et*at,it=Ne/(-Ye+at),dt=it*-Ye;if(le.matrixWorld.decompose(re.position,re.quaternion,re.scale),re.translateX(dt),re.translateZ(it),re.matrixWorld.compose(re.position,re.quaternion,re.scale),re.matrixWorldInverse.copy(re.matrixWorld).invert(),we[10]===-1)re.projectionMatrix.copy(le.projectionMatrix),re.projectionMatrixInverse.copy(le.projectionMatrixInverse);else{const G=Et+it,zt=qe+it,Ke=yt-dt,N=kt+(Ne-dt),b=Ve*qe/zt*G,Z=tt*qe/zt*G;re.projectionMatrix.makePerspective(Ke,N,b,Z,G,zt),re.projectionMatrixInverse.copy(re.projectionMatrix).invert()}}function ve(re,le){le===null?re.matrixWorld.copy(re.matrix):re.matrixWorld.multiplyMatrices(le.matrixWorld,re.matrix),re.matrixWorldInverse.copy(re.matrixWorld).invert()}this.updateCamera=function(re){if(i===null)return;let le=re.near,ye=re.far;p.texture!==null&&(p.depthNear>0&&(le=p.depthNear),p.depthFar>0&&(ye=p.depthFar)),U.near=P.near=C.near=le,U.far=P.far=C.far=ye,(R!==U.near||B!==U.far)&&(i.updateRenderState({depthNear:U.near,depthFar:U.far}),R=U.near,B=U.far),U.layers.mask=re.layers.mask|6,C.layers.mask=U.layers.mask&-5,P.layers.mask=U.layers.mask&-3;const Ne=re.parent,we=U.cameras;ve(U,Ne);for(let Ge=0;Ge<we.length;Ge++)ve(we[Ge],Ne);we.length===2?ue(U,C,P):U.projectionMatrix.copy(C.projectionMatrix),T===null&&re.isPerspectiveCamera&&(T={camera:re,fov:re.fov,zoom:re.zoom}),Me(re,U,Ne)};function Me(re,le,ye){ye===null?re.matrix.copy(le.matrixWorld):(re.matrix.copy(ye.matrixWorld),re.matrix.invert(),re.matrix.multiply(le.matrixWorld)),re.matrix.decompose(re.position,re.quaternion,re.scale),re.updateMatrixWorld(!0),re.projectionMatrix.copy(le.projectionMatrix),re.projectionMatrixInverse.copy(le.projectionMatrixInverse),re.isPerspectiveCamera&&(re.fov=Es*2*Math.atan(1/re.projectionMatrix.elements[5]),re.zoom=1)}this.getCamera=function(){return U},this.getFoveation=function(){if(!(u===null&&f===null))return l},this.setFoveation=function(re){l=re,u!==null&&(u.fixedFoveation=re),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=re)},this.hasDepthSensing=function(){return p.texture!==null},this.getDepthSensingMesh=function(){return p.getMesh(U)},this.getCameraTexture=function(re){return g[re]};let Xe=null;function Oe(re,le){if(h=le.getViewerPose(c||a),m=le,h!==null){const ye=h.views;f!==null&&(e.setRenderTargetFramebuffer(x,f.framebuffer),e.setRenderTarget(x));let Ne=!1;ye.length!==U.cameras.length&&(U.cameras.length=0,Ne=!0);for(let qe=0;qe<ye.length;qe++){const Ve=ye[qe];let tt=null;if(f!==null)tt=f.getViewport(Ve);else{const at=d.getViewSubImage(u,Ve);tt=at.viewport,qe===0&&(e.setRenderTargetTextures(x,at.colorTexture,at.depthStencilTexture),e.setRenderTarget(x))}let Ye=D[qe];Ye===void 0&&(Ye=new yn,Ye.layers.enable(qe),Ye.viewport=new Mt,D[qe]=Ye),Ye.matrix.fromArray(Ve.transform.matrix),Ye.matrix.decompose(Ye.position,Ye.quaternion,Ye.scale),Ye.projectionMatrix.fromArray(Ve.projectionMatrix),Ye.projectionMatrixInverse.copy(Ye.projectionMatrix).invert(),Ye.viewport.set(tt.x,tt.y,tt.width,tt.height),qe===0&&(U.matrix.copy(Ye.matrix),U.matrix.decompose(U.position,U.quaternion,U.scale)),Ne===!0&&U.cameras.push(Ye)}const we=i.enabledFeatures;if(we&&we.includes("depth-sensing")&&i.depthUsage=="gpu-optimized"&&_){d=n.getBinding();const qe=d.getDepthInformation(ye[0]);qe&&qe.isValid&&qe.texture&&p.init(qe,i.renderState)}if(we&&we.includes("camera-access")&&_){e.state.unbindTexture(),d=n.getBinding();for(let qe=0;qe<ye.length;qe++){const Ve=ye[qe].camera;if(Ve){let tt=g[Ve];tt||(tt=new Pf,g[Ve]=tt);const Ye=d.getCameraImage(Ve);tt.sourceTexture=Ye}}}}for(let ye=0;ye<w.length;ye++){const Ne=S[ye],we=w[ye];Ne!==null&&we!==void 0&&we.update(Ne,le,c||a)}Xe&&Xe(re,le),le.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:le}),m=null}const Ue=new md;Ue.setAnimationLoop(Oe),this.setAnimationLoop=function(re){Xe=re},this.dispose=function(){}}}const ny=new De,Wd=new Ze;Wd.set(-1,0,0,0,1,0,0,0,1);function iy(s,e){function t(p,g){p.matrixAutoUpdate===!0&&p.updateMatrix(),g.value.copy(p.matrix)}function n(p,g){g.color.getRGB(p.fogColor.value,$f(s)),g.isFog?(p.fogNear.value=g.near,p.fogFar.value=g.far):g.isFogExp2&&(p.fogDensity.value=g.density)}function i(p,g,v,M,x){g.isNodeMaterial?g.uniformsNeedUpdate=!1:g.isMeshBasicMaterial?r(p,g):g.isMeshLambertMaterial?(r(p,g),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)):g.isMeshToonMaterial?(r(p,g),d(p,g)):g.isMeshPhongMaterial?(r(p,g),h(p,g),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)):g.isMeshStandardMaterial?(r(p,g),u(p,g),g.isMeshPhysicalMaterial&&f(p,g,x)):g.isMeshMatcapMaterial?(r(p,g),m(p,g)):g.isMeshDepthMaterial?r(p,g):g.isMeshDistanceMaterial?(r(p,g),_(p,g)):g.isMeshNormalMaterial?r(p,g):g.isLineBasicMaterial?(a(p,g),g.isLineDashedMaterial&&o(p,g)):g.isPointsMaterial?l(p,g,v,M):g.isSpriteMaterial?c(p,g):g.isShadowMaterial?(p.color.value.copy(g.color),p.opacity.value=g.opacity):g.isShaderMaterial&&(g.uniformsNeedUpdate=!1)}function r(p,g){p.opacity.value=g.opacity,g.color&&p.diffuse.value.copy(g.color),g.emissive&&p.emissive.value.copy(g.emissive).multiplyScalar(g.emissiveIntensity),g.map&&(p.map.value=g.map,t(g.map,p.mapTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,t(g.alphaMap,p.alphaMapTransform)),g.bumpMap&&(p.bumpMap.value=g.bumpMap,t(g.bumpMap,p.bumpMapTransform),p.bumpScale.value=g.bumpScale,g.side===xn&&(p.bumpScale.value*=-1)),g.normalMap&&(p.normalMap.value=g.normalMap,t(g.normalMap,p.normalMapTransform),p.normalScale.value.copy(g.normalScale),g.side===xn&&p.normalScale.value.negate()),g.displacementMap&&(p.displacementMap.value=g.displacementMap,t(g.displacementMap,p.displacementMapTransform),p.displacementScale.value=g.displacementScale,p.displacementBias.value=g.displacementBias),g.emissiveMap&&(p.emissiveMap.value=g.emissiveMap,t(g.emissiveMap,p.emissiveMapTransform)),g.specularMap&&(p.specularMap.value=g.specularMap,t(g.specularMap,p.specularMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest);const v=e.get(g),M=v.envMap,x=v.envMapRotation;M&&(p.envMap.value=M,p.envMapRotation.value.setFromMatrix4(ny.makeRotationFromEuler(x)).transpose(),M.isCubeTexture&&M.isRenderTargetTexture===!1&&p.envMapRotation.value.premultiply(Wd),p.reflectivity.value=g.reflectivity,p.ior.value=g.ior,p.refractionRatio.value=g.refractionRatio),g.lightMap&&(p.lightMap.value=g.lightMap,p.lightMapIntensity.value=g.lightMapIntensity,t(g.lightMap,p.lightMapTransform)),g.aoMap&&(p.aoMap.value=g.aoMap,p.aoMapIntensity.value=g.aoMapIntensity,t(g.aoMap,p.aoMapTransform))}function a(p,g){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,g.map&&(p.map.value=g.map,t(g.map,p.mapTransform))}function o(p,g){p.dashSize.value=g.dashSize,p.totalSize.value=g.dashSize+g.gapSize,p.scale.value=g.scale}function l(p,g,v,M){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,p.size.value=g.size*v,p.scale.value=M*.5,g.map&&(p.map.value=g.map,t(g.map,p.uvTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,t(g.alphaMap,p.alphaMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest)}function c(p,g){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,p.rotation.value=g.rotation,g.map&&(p.map.value=g.map,t(g.map,p.mapTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,t(g.alphaMap,p.alphaMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest)}function h(p,g){p.specular.value.copy(g.specular),p.shininess.value=Math.max(g.shininess,1e-4)}function d(p,g){g.gradientMap&&(p.gradientMap.value=g.gradientMap)}function u(p,g){p.metalness.value=g.metalness,g.metalnessMap&&(p.metalnessMap.value=g.metalnessMap,t(g.metalnessMap,p.metalnessMapTransform)),p.roughness.value=g.roughness,g.roughnessMap&&(p.roughnessMap.value=g.roughnessMap,t(g.roughnessMap,p.roughnessMapTransform)),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)}function f(p,g,v){p.ior.value=g.ior,g.sheen>0&&(p.sheenColor.value.copy(g.sheenColor).multiplyScalar(g.sheen),p.sheenRoughness.value=g.sheenRoughness,g.sheenColorMap&&(p.sheenColorMap.value=g.sheenColorMap,t(g.sheenColorMap,p.sheenColorMapTransform)),g.sheenRoughnessMap&&(p.sheenRoughnessMap.value=g.sheenRoughnessMap,t(g.sheenRoughnessMap,p.sheenRoughnessMapTransform))),g.clearcoat>0&&(p.clearcoat.value=g.clearcoat,p.clearcoatRoughness.value=g.clearcoatRoughness,g.clearcoatMap&&(p.clearcoatMap.value=g.clearcoatMap,t(g.clearcoatMap,p.clearcoatMapTransform)),g.clearcoatRoughnessMap&&(p.clearcoatRoughnessMap.value=g.clearcoatRoughnessMap,t(g.clearcoatRoughnessMap,p.clearcoatRoughnessMapTransform)),g.clearcoatNormalMap&&(p.clearcoatNormalMap.value=g.clearcoatNormalMap,t(g.clearcoatNormalMap,p.clearcoatNormalMapTransform),p.clearcoatNormalScale.value.copy(g.clearcoatNormalScale),g.side===xn&&p.clearcoatNormalScale.value.negate())),g.dispersion>0&&(p.dispersion.value=g.dispersion),g.retroreflectivity>0&&(p.retroreflectivity.value=g.retroreflectivity),g.iridescence>0&&(p.iridescence.value=g.iridescence,p.iridescenceIOR.value=g.iridescenceIOR,p.iridescenceThicknessMinimum.value=g.iridescenceThicknessRange[0],p.iridescenceThicknessMaximum.value=g.iridescenceThicknessRange[1],g.iridescenceMap&&(p.iridescenceMap.value=g.iridescenceMap,t(g.iridescenceMap,p.iridescenceMapTransform)),g.iridescenceThicknessMap&&(p.iridescenceThicknessMap.value=g.iridescenceThicknessMap,t(g.iridescenceThicknessMap,p.iridescenceThicknessMapTransform))),g.transmission>0&&(p.transmission.value=g.transmission,p.transmissionSamplerMap.value=v.texture,p.transmissionSamplerSize.value.set(v.width,v.height),g.transmissionMap&&(p.transmissionMap.value=g.transmissionMap,t(g.transmissionMap,p.transmissionMapTransform)),p.thickness.value=g.thickness,g.thicknessMap&&(p.thicknessMap.value=g.thicknessMap,t(g.thicknessMap,p.thicknessMapTransform)),p.attenuationDistance.value=g.attenuationDistance,p.attenuationColor.value.copy(g.attenuationColor)),g.anisotropy>0&&(p.anisotropyVector.value.set(g.anisotropy*Math.cos(g.anisotropyRotation),g.anisotropy*Math.sin(g.anisotropyRotation)),g.anisotropyMap&&(p.anisotropyMap.value=g.anisotropyMap,t(g.anisotropyMap,p.anisotropyMapTransform))),p.specularIntensity.value=g.specularIntensity,p.specularColor.value.copy(g.specularColor),g.specularColorMap&&(p.specularColorMap.value=g.specularColorMap,t(g.specularColorMap,p.specularColorMapTransform)),g.specularIntensityMap&&(p.specularIntensityMap.value=g.specularIntensityMap,t(g.specularIntensityMap,p.specularIntensityMapTransform))}function m(p,g){g.matcap&&(p.matcap.value=g.matcap)}function _(p,g){const v=e.get(g).light;p.referencePosition.value.setFromMatrixPosition(v.matrixWorld),p.nearDistance.value=v.shadow.camera.near,p.farDistance.value=v.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:i}}function sy(s,e,t,n){let i={},r={},a=[];const o=s.getParameter(s.MAX_UNIFORM_BUFFER_BINDINGS);function l(x,w){const S=w.program;n.uniformBlockBinding(x,S)}function c(x,w){let S=i[x.id];S===void 0&&(p(x),S=h(x),i[x.id]=S,x.addEventListener("dispose",v));const A=w.program;n.updateUBOMapping(x,A);const y=e.render.frame;r[x.id]!==y&&(u(x),r[x.id]=y)}function h(x){const w=d();x.__bindingPointIndex=w;const S=s.createBuffer(),A=x.__size,y=x.usage;return s.bindBuffer(s.UNIFORM_BUFFER,S),s.bufferData(s.UNIFORM_BUFFER,A,y),s.bindBuffer(s.UNIFORM_BUFFER,null),s.bindBufferBase(s.UNIFORM_BUFFER,w,S),S}function d(){for(let x=0;x<o;x++)if(a.indexOf(x)===-1)return a.push(x),x;return He("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function u(x){const w=i[x.id],S=x.uniforms,A=x.__cache;s.bindBuffer(s.UNIFORM_BUFFER,w);for(let y=0,T=S.length;y<T;y++){const C=S[y];if(Array.isArray(C))for(let P=0,D=C.length;P<D;P++)f(C[P],y,P,A);else f(C,y,0,A)}s.bindBuffer(s.UNIFORM_BUFFER,null)}function f(x,w,S,A){if(_(x,w,S,A)===!0){const y=x.__offset,T=x.value;if(Array.isArray(T)){let C=0;for(let P=0;P<T.length;P++){const D=T[P],U=g(D);m(D,x.__data,C),typeof D!="number"&&typeof D!="boolean"&&!D.isMatrix3&&!ArrayBuffer.isView(D)&&(C+=U.storage/Float32Array.BYTES_PER_ELEMENT)}}else m(T,x.__data,0);s.bufferSubData(s.UNIFORM_BUFFER,y,x.__data)}}function m(x,w,S){typeof x=="number"||typeof x=="boolean"?w[0]=x:x.isMatrix3?(w[0]=x.elements[0],w[1]=x.elements[1],w[2]=x.elements[2],w[3]=0,w[4]=x.elements[3],w[5]=x.elements[4],w[6]=x.elements[5],w[7]=0,w[8]=x.elements[6],w[9]=x.elements[7],w[10]=x.elements[8],w[11]=0):ArrayBuffer.isView(x)?w.set(new x.constructor(x.buffer,x.byteOffset,w.length)):x.toArray(w,S)}function _(x,w,S,A){const y=x.value,T=w+"_"+S;if(A[T]===void 0)return typeof y=="number"||typeof y=="boolean"?A[T]=y:ArrayBuffer.isView(y)?A[T]=y.slice():A[T]=y.clone(),!0;{const C=A[T];if(typeof y=="number"||typeof y=="boolean"){if(C!==y)return A[T]=y,!0}else{if(ArrayBuffer.isView(y))return!0;if(C.equals(y)===!1)return C.copy(y),!0}}return!1}function p(x){const w=x.uniforms;let S=0;const A=16;for(let T=0,C=w.length;T<C;T++){const P=Array.isArray(w[T])?w[T]:[w[T]];for(let D=0,U=P.length;D<U;D++){const R=P[D],B=Array.isArray(R.value)?R.value:[R.value];for(let V=0,q=B.length;V<q;V++){const se=B[V],$=g(se),ee=S%A,ue=ee%$.boundary,ve=ee+ue;S+=ue,ve!==0&&A-ve<$.storage&&(S+=A-ve),R.__data=new Float32Array($.storage/Float32Array.BYTES_PER_ELEMENT),R.__offset=S,S+=$.storage}}}const y=S%A;return y>0&&(S+=A-y),x.__size=S,x.__cache={},this}function g(x){const w={boundary:0,storage:0};return typeof x=="number"||typeof x=="boolean"?(w.boundary=4,w.storage=4):x.isVector2?(w.boundary=8,w.storage=8):x.isVector3||x.isColor?(w.boundary=16,w.storage=12):x.isVector4?(w.boundary=16,w.storage=16):x.isMatrix3?(w.boundary=48,w.storage=48):x.isMatrix4?(w.boundary=64,w.storage=64):x.isTexture?Fe("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(x)?(w.boundary=16,w.storage=x.byteLength):Fe("WebGLRenderer: Unsupported uniform value type.",x),w}function v(x){const w=x.target;w.removeEventListener("dispose",v);const S=a.indexOf(w.__bindingPointIndex);a.splice(S,1),s.deleteBuffer(i[w.id]),delete i[w.id],delete r[w.id]}function M(){for(const x in i)s.deleteBuffer(i[x]);a=[],i={},r={}}return{bind:l,update:c,dispose:M}}const ry=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);let gi=null;function ay(){return gi===null&&(gi=new Ws(ry,16,16,is,un),gi.name="DFG_LUT",gi.minFilter=Gt,gi.magFilter=Gt,gi.wrapS=Fn,gi.wrapT=Fn,gi.generateMipmaps=!1,gi.needsUpdate=!0),gi}class oy{constructor(e={}){const{canvas:t=Pm(),context:n=null,depth:i=!0,stencil:r=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:d=!1,reversedDepthBuffer:u=!1,outputBufferType:f=vn}=e;this.isWebGLRenderer=!0;let m;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");m=n.getContextAttributes().alpha}else m=a;const _=f,p=new Set([Rl,Cl,El]),g=new Set([vn,li,Pr,Ts,Tl,Al]),v=new Uint32Array(4),M=new Int32Array(4),x=new L;let w=null,S=null;const A=[],y=[];let T=null;this.domElement=t,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=oi,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const C=this;let P=!1,D=null,U=null,R=null,B=null;this._outputColorSpace=Wt;let V=0,q=0,se=null,$=-1,ee=null;const ue=new Mt,ve=new Mt;let Me=null;const Xe=new ge(0);let Oe=0,Ue=t.width,re=t.height,le=1,ye=null,Ne=null;const we=new Mt(0,0,Ue,re),Ge=new Mt(0,0,Ue,re);let Et=!1;const qe=new Oc;let Ve=!1,tt=!1;const Ye=new De,at=new L,yt=new Mt,kt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let it=!1;function dt(){return se===null?le:1}let G=n;function zt(E,W){return t.getContext(E,W)}let Ke,N,b,Z,Q,he,k,K,Y,ie,xe,O,z,X,J,fe,oe,I,ae,j,me,_e,de;try{const E={alpha:!0,depth:i,stencil:r,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:d};if("setAttribute"in t&&t.setAttribute("data-engine","three.js r186"),t.addEventListener("webglcontextlost",ft,!1),t.addEventListener("webglcontextrestored",ct,!1),t.addEventListener("webglcontextcreationerror",sn,!1),G===null){const W="webgl2";if(G=zt(W,E),G===null)throw zt(W)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}Se()}catch(E){throw t.removeEventListener("webglcontextlost",ft,!1),t.removeEventListener("webglcontextrestored",ct,!1),t.removeEventListener("webglcontextcreationerror",sn,!1),He("WebGLRenderer: "+E.message),E}function Se(){Ke=new a_(G),Ke.init(),me=new JM(G,Ke),N=new Kv(G,Ke,e,me),b=new $M(G,Ke),N.reversedDepthBuffer&&u&&b.buffers.depth.setReversed(!0),U=G.createFramebuffer(),R=G.createFramebuffer(),B=G.createFramebuffer(),Z=new c_(G),Q=new NM,he=new KM(G,Ke,b,Q,N,me,Z),k=new r_(C),K=new Xg(G),_e=new Zv(G,K),Y=new o_(G,K,Z,_e),ie=new u_(G,Y,K,_e,Z),I=new h_(G,N,he),J=new Jv(Q),xe=new UM(C,k,Ke,N,_e,J),O=new iy(C,Q),z=new FM,X=new GM(Ke),oe=new qv(C,k,b,ie,m,l),fe=new ZM(C,ie,N),de=new sy(G,Z,N,b),ae=new $v(G,Ke,Z),j=new l_(G,Ke,Z),Z.programs=xe.programs,C.capabilities=N,C.extensions=Ke,C.properties=Q,C.renderLists=z,C.shadowMap=fe,C.state=b,C.info=Z}_!==vn&&(T=new d_(_,t.width,t.height,o,i,r));const be=new ty(C,G);this.xr=be,this.getContext=function(){return G},this.getContextAttributes=function(){return G.getContextAttributes()},this.forceContextLoss=function(){const E=Ke.get("WEBGL_lose_context");E&&E.loseContext()},this.forceContextRestore=function(){const E=Ke.get("WEBGL_lose_context");E&&E.restoreContext()},this.getPixelRatio=function(){return le},this.setPixelRatio=function(E){E!==void 0&&(le=E,this.setSize(Ue,re,!1))},this.getSize=function(E){return E.set(Ue,re)},this.setSize=function(E,W,ce=!0){if(be.isPresenting){Fe("WebGLRenderer: Can't change size while VR device is presenting.");return}Ue=E,re=W,t.width=Math.floor(E*le),t.height=Math.floor(W*le),ce===!0&&(t.style.width=E+"px",t.style.height=W+"px"),T!==null&&T.setSize(t.width,t.height),this.setViewport(0,0,E,W)},this.getDrawingBufferSize=function(E){return E.set(Ue*le,re*le).floor()},this.setDrawingBufferSize=function(E,W,ce){Ue=E,re=W,le=ce,t.width=Math.floor(E*ce),t.height=Math.floor(W*ce),this.setViewport(0,0,E,W)},this.setEffects=function(E){if(_===vn){He("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(E){for(let W=0;W<E.length;W++)if(E[W].isOutputPass===!0){Fe("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}T.setEffects(E||[])},this.getCurrentViewport=function(E){return E.copy(ue)},this.getViewport=function(E){return E.copy(we)},this.setViewport=function(E,W,ce,te){E.isVector4?we.set(E.x,E.y,E.z,E.w):we.set(E,W,ce,te),b.viewport(ue.copy(we).multiplyScalar(le).round())},this.getScissor=function(E){return E.copy(Ge)},this.setScissor=function(E,W,ce,te){E.isVector4?Ge.set(E.x,E.y,E.z,E.w):Ge.set(E,W,ce,te),b.scissor(ve.copy(Ge).multiplyScalar(le).round())},this.getScissorTest=function(){return Et},this.setScissorTest=function(E){b.setScissorTest(Et=E)},this.setOpaqueSort=function(E){ye=E},this.setTransparentSort=function(E){Ne=E},this.getClearColor=function(E){return E.copy(oe.getClearColor())},this.setClearColor=function(){oe.setClearColor(...arguments)},this.getClearAlpha=function(){return oe.getClearAlpha()},this.setClearAlpha=function(){oe.setClearAlpha(...arguments)},this.clear=function(E=!0,W=!0,ce=!0){let te=0;if(E){let ne=!1;if(se!==null){const Ee=se.texture.format;ne=p.has(Ee)}if(ne){const Ee=se.texture.type,Pe=g.has(Ee),Ae=oe.getClearColor(),Ie=oe.getClearAlpha(),ze=Ae.r,nt=Ae.g,ot=Ae.b;Pe?(v[0]=ze,v[1]=nt,v[2]=ot,v[3]=Ie,G.clearBufferuiv(G.COLOR,0,v)):(M[0]=ze,M[1]=nt,M[2]=ot,M[3]=Ie,G.clearBufferiv(G.COLOR,0,M))}else te|=G.COLOR_BUFFER_BIT}W&&(te|=G.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),ce&&(te|=G.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),te!==0&&G.clear(te)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(E){E.setRenderer(this),D=E},this.dispose=function(){t.removeEventListener("webglcontextlost",ft,!1),t.removeEventListener("webglcontextrestored",ct,!1),t.removeEventListener("webglcontextcreationerror",sn,!1),oe.dispose(),z.dispose(),X.dispose(),Q.dispose(),k.dispose(),ie.dispose(),_e.dispose(),de.dispose(),xe.dispose(),be.dispose(),be.removeEventListener("sessionstart",Yn),be.removeEventListener("sessionend",qn),Zn.stop()};function ft(E){E.preventDefault(),Ga("WebGLRenderer: Context Lost."),P=!0}function ct(){Ga("WebGLRenderer: Context Restored."),P=!1;const E=Z.autoReset,W=fe.enabled,ce=fe.autoUpdate,te=fe.needsUpdate,ne=fe.type;Se(),Z.autoReset=E,fe.enabled=W,fe.autoUpdate=ce,fe.needsUpdate=te,fe.type=ne}function sn(E){He("WebGLRenderer: A WebGL context could not be created. Reason: ",E.statusMessage)}function En(E){const W=E.target;W.removeEventListener("dispose",En),al(W)}function al(E){gu(E),Q.remove(E)}function gu(E){const W=Q.get(E).programs;W!==void 0&&(W.forEach(function(ce){xe.releaseProgram(ce)}),E.isShaderMaterial&&xe.releaseShaderCache(E))}this.renderBufferDirect=function(E,W,ce,te,ne,Ee){W===null&&(W=kt);const Pe=ne.isMesh&&ne.matrixWorld.determinantAffine()<0,Ae=hb(E,W,ce,te,ne);b.setMaterial(te,Pe);let Ie=ce.index,ze=1;if(te.wireframe===!0){if(Ie=Y.getWireframeAttribute(ce),Ie===void 0)return;ze=2}const nt=ce.drawRange,ot=ce.attributes.position;let Le=nt.start*ze,St=(nt.start+nt.count)*ze;Ee!==null&&(Le=Math.max(Le,Ee.start*ze),St=Math.min(St,(Ee.start+Ee.count)*ze)),Ie!==null?(Le=Math.max(Le,0),St=Math.min(St,Ie.count)):ot!=null&&(Le=Math.max(Le,0),St=Math.min(St,ot.count));const Kt=St-Le;if(Kt<0||Kt===1/0)return;_e.setup(ne,te,Ae,ce,Ie);let Nt,Pt=ae;if(Ie!==null&&(Nt=K.get(Ie),Pt=j,Pt.setIndex(Nt)),ne.isMesh)te.wireframe===!0?(b.setLineWidth(te.wireframeLinewidth*dt()),Pt.setMode(G.LINES)):Pt.setMode(G.TRIANGLES);else if(ne.isLine){let gn=te.linewidth;gn===void 0&&(gn=1),b.setLineWidth(gn*dt()),ne.isLineSegments?Pt.setMode(G.LINES):ne.isLineLoop?Pt.setMode(G.LINE_LOOP):Pt.setMode(G.LINE_STRIP)}else ne.isPoints?Pt.setMode(G.POINTS):ne.isSprite&&Pt.setMode(G.TRIANGLES);if(ne.isBatchedMesh)if(Ke.get("WEBGL_multi_draw"))Pt.renderMultiDraw(ne._multiDrawStarts,ne._multiDrawCounts,ne._multiDrawCount);else{const gn=ne._multiDrawStarts,Re=ne._multiDrawCounts,Sn=ne._multiDrawCount,pt=Ie?K.get(Ie).bytesPerElement:1,$n=Q.get(te).currentProgram.getUniforms();for(let bi=0;bi<Sn;bi++)$n.setValue(G,"_gl_DrawID",bi),Pt.render(gn[bi]/pt,Re[bi])}else if(ne.isInstancedMesh)Pt.renderInstances(Le,Kt,ne.count);else if(ce.isInstancedBufferGeometry){const gn=ce._maxInstanceCount!==void 0?ce._maxInstanceCount:1/0,Re=Math.min(ce.instanceCount,gn);Pt.renderInstances(Le,Kt,Re)}else Pt.render(Le,Kt)};function _r(E,W,ce,te){D!==null&&E.isNodeMaterial&&D.setObject(te,E),Ve===!0&&J.setState(E,ce,!1),E.transparent===!0&&E.side===rn&&E.forceSinglePass===!1?(E.side=xn,E.needsUpdate=!0,wi(E,W,te),E.side=ki,E.needsUpdate=!0,wi(E,W,te),E.side=rn):wi(E,W,te)}this.compile=function(E,W,ce=null){ce===null&&(ce=E),D!==null&&D.renderStart(E,W,ce),S=X.get(ce),S.init(W),y.push(S),ce.traverseVisible(function(ne){ne.isLight&&ne.layers.test(W.layers)&&(S.pushLight(ne),ne.castShadow&&S.pushShadow(ne))}),E!==ce&&E.traverseVisible(function(ne){ne.isLight&&ne.layers.test(W.layers)&&(S.pushLight(ne),ne.castShadow&&S.pushShadow(ne))}),S.setupLights(),D!==null&&D.updateLights(S.state.lightsArray),tt=this.localClippingEnabled,Ve=J.init(this.clippingPlanes,tt),Ve===!0&&J.setGlobalState(this.clippingPlanes,W),D!==null&&fe.render(S.state.shadowsArray,ce,W);const te=new Set;return E.traverse(function(ne){if(!(ne.isMesh||ne.isPoints||ne.isLine||ne.isSprite))return;const Ee=ne.material;if(Ee)if(Array.isArray(Ee))for(let Pe=0;Pe<Ee.length;Pe++){const Ae=Ee[Pe];_r(Ae,ce,W,ne),te.add(Ae)}else _r(Ee,ce,W,ne),te.add(Ee)}),S=y.pop(),D!==null&&D.renderEnd(),te},this.compileAsync=function(E,W,ce=null){const te=this.compile(E,W,ce);return new Promise(ne=>{function Ee(){if(te.forEach(function(Pe){const Ie=Q.get(Pe).currentProgram;(Ie===void 0||Ie.isReady())&&te.delete(Pe)}),te.size===0){ne(E);return}setTimeout(Ee,10)}Ke.get("KHR_parallel_shader_compile")!==null?Ee():setTimeout(Ee,10)})};let Ca=null;function Ct(E){Ca&&Ca(E)}function Yn(){Zn.stop()}function qn(){Zn.start()}const Zn=new md;Zn.setAnimationLoop(Ct),typeof self<"u"&&Zn.setContext(self),this.setAnimationLoop=function(E){Ca=E,be.setAnimationLoop(E),E===null?Zn.stop():Zn.start()},be.addEventListener("sessionstart",Yn),be.addEventListener("sessionend",qn),this.render=function(E,W){if(W!==void 0&&W.isCamera!==!0){He("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(P===!0)return;D!==null&&D.renderStart(E,W);const ce=be.enabled===!0&&be.isPresenting===!0,te=T!==null&&(se===null||ce)&&T.begin(C,se);if(E.matrixWorldAutoUpdate===!0&&E.updateMatrixWorld(),W.parent===null&&W.matrixWorldAutoUpdate===!0&&W.updateMatrixWorld(),be.enabled===!0&&be.isPresenting===!0&&(T===null||T.isCompositing()===!1)&&(be.cameraAutoUpdate===!0&&be.updateCamera(W),W=be.getCamera()),E.isScene===!0&&E.onBeforeRender(C,E,W,se),S=X.get(E,y.length),S.init(W),S.state.textureUnits=he.getTextureUnits(),y.push(S),Ye.multiplyMatrices(W.projectionMatrix,W.matrixWorldInverse),qe.setFromProjectionMatrix(Ye,ci,W.reversedDepth),tt=this.localClippingEnabled,Ve=J.init(this.clippingPlanes,tt),w=z.get(E,A.length),w.init(),A.push(w),be.enabled===!0&&be.isPresenting===!0){const Pe=C.xr.getDepthSensingMesh();Pe!==null&&Bi(Pe,W,-1/0,C.sortObjects)}Bi(E,W,0,C.sortObjects),w.finish(),D!==null&&D.updateLights(S.state.lightsArray),C.sortObjects===!0&&w.sort(ye,Ne),it=be.enabled===!1||be.isPresenting===!1||be.hasDepthSensing()===!1,it&&oe.addToRenderList(w,E),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),Ve===!0&&J.beginShadows();const ne=S.state.shadowsArray;if(fe.render(ne,E,W),Ve===!0&&J.endShadows(),(te&&T.hasRenderPass())===!1){const Pe=w.opaque,Ae=w.transmissive;if(S.setupLights(),W.isArrayCamera){const Ie=W.cameras;if(Ae.length>0)for(let ze=0,nt=Ie.length;ze<nt;ze++){const ot=Ie[ze];yr(Pe,Ae,E,ot)}it&&oe.render(E);for(let ze=0,nt=Ie.length;ze<nt;ze++){const ot=Ie[ze];Mr(w,E,ot,ot.viewport)}}else Ae.length>0&&yr(Pe,Ae,E,W),it&&oe.render(E),Mr(w,E,W)}se!==null&&q===0&&(he.updateMultisampleRenderTarget(se),he.updateRenderTargetMipmap(se)),te&&T.end(C),E.isScene===!0&&E.onAfterRender(C,E,W),_e.resetDefaultState(),$=-1,ee=null,y.pop(),y.length>0?(S=y[y.length-1],he.setTextureUnits(S.state.textureUnits),Ve===!0&&J.setGlobalState(C.clippingPlanes,S.state.camera)):S=null,A.pop(),A.length>0?w=A[A.length-1]:w=null,D!==null&&D.renderEnd()};function Bi(E,W,ce,te){if(E.visible===!1)return;if(E.layers.test(W.layers)){if(E.isGroup)ce=E.renderOrder;else if(E.isLOD)E.autoUpdate===!0&&E.update(W);else if(E.isLightProbeGrid)S.pushLightProbeGrid(E);else if(E.isLight)S.pushLight(E),E.castShadow&&S.pushShadow(E);else if(E.isSprite){if(!E.frustumCulled||E.intersectsFrustum(qe)){te&&yt.setFromMatrixPosition(E.matrixWorld).applyMatrix4(Ye);const Pe=ie.update(E),Ae=E.material;Ae.visible&&w.push(E,Pe,Ae,ce,yt.z,null,W)}}else if((E.isMesh||E.isLine||E.isPoints)&&(!E.frustumCulled||E.intersectsFrustum(qe))){const Pe=ie.update(E),Ae=E.material;if(te&&(E.boundingSphere!==void 0?(E.boundingSphere===null&&E.computeBoundingSphere(),yt.copy(E.boundingSphere.center)):(Pe.boundingSphere===null&&Pe.computeBoundingSphere(),yt.copy(Pe.boundingSphere.center)),yt.applyMatrix4(E.matrixWorld).applyMatrix4(Ye)),Array.isArray(Ae)){const Ie=Pe.groups;for(let ze=0,nt=Ie.length;ze<nt;ze++){const ot=Ie[ze],Le=Ae[ot.materialIndex];Le&&Le.visible&&w.push(E,Pe,Le,ce,yt.z,ot,W)}}else Ae.visible&&w.push(E,Pe,Ae,ce,yt.z,null,W)}}const Ee=E.children;for(let Pe=0,Ae=Ee.length;Pe<Ae;Pe++)Bi(Ee[Pe],W,ce,te)}function Mr(E,W,ce,te){const{opaque:ne,transmissive:Ee,transparent:Pe}=E;S.setupLightsView(ce),Ve===!0&&J.setGlobalState(C.clippingPlanes,ce),te&&b.viewport(ue.copy(te)),ne.length>0&&ys(ne,W,ce),Ee.length>0&&ys(Ee,W,ce),Pe.length>0&&ys(Pe,W,ce),b.buffers.depth.setTest(!0),b.buffers.depth.setMask(!0),b.buffers.color.setMask(!0),b.setPolygonOffset(!1)}function yr(E,W,ce,te){if((ce.isScene===!0?ce.overrideMaterial:null)!==null)return;if(S.state.transmissionRenderTarget[te.id]===void 0){const Le=Ke.has("EXT_color_buffer_half_float")||Ke.has("EXT_color_buffer_float");S.state.transmissionRenderTarget[te.id]=new on(1,1,{generateMipmaps:!0,type:Le?un:vn,minFilter:Ti,samples:Math.max(4,N.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:st.workingColorSpace})}const Ee=S.state.transmissionRenderTarget[te.id],Pe=te.viewport||ue;Ee.setSize(Pe.z*C.transmissionResolutionScale,Pe.w*C.transmissionResolutionScale);const Ae=C.getRenderTarget(),Ie=C.getActiveCubeFace(),ze=C.getActiveMipmapLevel();C.setRenderTarget(Ee),C.getClearColor(Xe),Oe=C.getClearAlpha(),Oe<1&&C.setClearColor(16777215,.5),C.clear(),it&&oe.render(ce);const nt=C.toneMapping;C.toneMapping=oi;const ot=te.viewport;if(te.viewport!==void 0&&(te.viewport=void 0),S.setupLightsView(te),Ve===!0&&J.setGlobalState(C.clippingPlanes,te),ys(E,ce,te),he.updateMultisampleRenderTarget(Ee),he.updateRenderTargetMipmap(Ee),Ke.has("WEBGL_multisampled_render_to_texture")===!1){let Le=!1;for(let St=0,Kt=W.length;St<Kt;St++){const Nt=W[St],{object:Pt,geometry:gn,material:Re,group:Sn}=Nt;if(Re.side===rn&&Pt.layers.test(te.layers)){const pt=Re.side;Re.side=xn,Re.needsUpdate=!0,Ra(Pt,ce,te,gn,Re,Sn),Re.side=pt,Re.needsUpdate=!0,Le=!0}}Le===!0&&(he.updateMultisampleRenderTarget(Ee),he.updateRenderTargetMipmap(Ee))}C.setRenderTarget(Ae,Ie,ze),C.setClearColor(Xe,Oe),ot!==void 0&&(te.viewport=ot),C.toneMapping=nt}function ys(E,W,ce){const te=W.isScene===!0?W.overrideMaterial:null;for(let ne=0,Ee=E.length;ne<Ee;ne++){const Pe=E[ne],{object:Ae,geometry:Ie,group:ze}=Pe;let nt=Pe.material;nt.allowOverride===!0&&te!==null&&(nt=te),Ae.layers.test(ce.layers)&&Ra(Ae,W,ce,Ie,nt,ze)}}function Ra(E,W,ce,te,ne,Ee){D!==null&&ne.isNodeMaterial&&D.setObject(E,ne),E.onBeforeRender(C,W,ce,te,ne,Ee),E.modelViewMatrix.multiplyMatrices(ce.matrixWorldInverse,E.matrixWorld),E.normalMatrix.getNormalMatrix(E.modelViewMatrix),ne.onBeforeRender(C,W,ce,te,E,Ee),ne.transparent===!0&&ne.side===rn&&ne.forceSinglePass===!1?(ne.side=xn,ne.needsUpdate=!0,C.renderBufferDirect(ce,W,te,ne,E,Ee),ne.side=ki,ne.needsUpdate=!0,C.renderBufferDirect(ce,W,te,ne,E,Ee),ne.side=rn):C.renderBufferDirect(ce,W,te,ne,E,Ee),E.onAfterRender(C,W,ce,te,ne,Ee)}function wi(E,W,ce){W.isScene!==!0&&(W=kt);const te=Q.get(E),ne=S.state.lights,Ee=S.state.shadowsArray,Pe=ne.state.version,Ae=xe.getParameters(E,ne.state,Ee,W,ce,S.state.lightProbeGridArray),Ie=xe.getProgramCacheKey(Ae);let ze=te.programs;te.environment=E.isMeshStandardMaterial||E.isMeshLambertMaterial||E.isMeshPhongMaterial?W.environment:null,te.fog=W.fog;const nt=E.isMeshStandardMaterial||E.isMeshLambertMaterial&&!E.envMap||E.isMeshPhongMaterial&&!E.envMap;te.envMap=k.get(E.envMap||te.environment,nt),te.envMapRotation=te.environment!==null&&E.envMap===null?W.environmentRotation:E.envMapRotation,ze===void 0&&(E.addEventListener("dispose",En),ze=new Map,te.programs=ze);let ot=ze.get(Ie);if(ot!==void 0){if(te.currentProgram===ot&&te.lightsStateVersion===Pe)return Zp(E,Ae),ot}else Ae.uniforms=xe.getUniforms(E),D!==null&&E.isNodeMaterial&&D.build(E,ce,Ae),E.onBeforeCompile(Ae,C),ot=xe.acquireProgram(Ae,Ie),ze.set(Ie,ot),te.uniforms=Ae.uniforms;const Le=te.uniforms;return(!E.isShaderMaterial&&!E.isRawShaderMaterial||E.clipping===!0)&&(Le.clippingPlanes=J.uniform),Zp(E,Ae),te.needsLights=fb(E),te.lightsStateVersion=Pe,te.needsLights&&(Le.ambientLightColor.value=ne.state.ambient,Le.lightProbe.value=ne.state.probe,Le.sunLights.value=ne.state.sun,Le.sunLightShadows.value=ne.state.sunShadow,Le.directionalLights.value=ne.state.directional,Le.directionalLightShadows.value=ne.state.directionalShadow,Le.spotLights.value=ne.state.spot,Le.spotLightShadows.value=ne.state.spotShadow,Le.rectAreaLights.value=ne.state.rectArea,Le.ltc_1.value=ne.state.rectAreaLTC1,Le.ltc_2.value=ne.state.rectAreaLTC2,Le.pointLights.value=ne.state.point,Le.pointLightShadows.value=ne.state.pointShadow,Le.hemisphereLights.value=ne.state.hemi,Le.sunShadowMatrix.value=ne.state.sunShadowMatrix,Le.sunShadowCascade.value=ne.state.sunShadowCascade,Le.directionalShadowMatrix.value=ne.state.directionalShadowMatrix,Le.spotLightMatrix.value=ne.state.spotLightMatrix,Le.spotLightMap.value=ne.state.spotLightMap,Le.pointShadowMatrix.value=ne.state.pointShadowMatrix),te.lightProbeGrid=S.state.lightProbeGridArray.length>0,te.currentProgram=ot,te.uniformsList=null,ot}function Sr(E){if(E.uniformsList===null){const W=E.currentProgram.getUniforms();E.uniformsList=Do.seqWithValue(W.seq,E.uniforms)}return E.uniformsList}function Zp(E,W){const ce=Q.get(E);ce.outputColorSpace=W.outputColorSpace,ce.batching=W.batching,ce.batchingColor=W.batchingColor,ce.instancing=W.instancing,ce.instancingColor=W.instancingColor,ce.instancingMorph=W.instancingMorph,ce.skinning=W.skinning,ce.morphTargets=W.morphTargets,ce.morphNormals=W.morphNormals,ce.morphColors=W.morphColors,ce.morphTargetsCount=W.morphTargetsCount,ce.numClippingPlanes=W.numClippingPlanes,ce.numIntersection=W.numClipIntersection,ce.vertexAlphas=W.vertexAlphas,ce.vertexTangents=W.vertexTangents,ce.toneMapping=W.toneMapping}function cb(E,W){if(E.length===0)return null;if(E.length===1)return E[0].texture!==null?E[0]:null;x.setFromMatrixPosition(W.matrixWorld);for(let ce=0,te=E.length;ce<te;ce++){const ne=E[ce];if(ne.texture!==null&&ne.boundingBox.containsPoint(x))return ne}return null}function hb(E,W,ce,te,ne){W.isScene!==!0&&(W=kt),he.resetTextureUnits();const Ee=W.fog,Pe=te.isMeshStandardMaterial||te.isMeshLambertMaterial||te.isMeshPhongMaterial?W.environment:null,Ae=se===null?C.outputColorSpace:se.isXRRenderTarget===!0?se.texture.colorSpace:st.workingColorSpace,Ie=te.isMeshStandardMaterial||te.isMeshLambertMaterial&&!te.envMap||te.isMeshPhongMaterial&&!te.envMap,ze=k.get(te.envMap||Pe,Ie),nt=te.vertexColors===!0&&!!ce.attributes.color&&ce.attributes.color.itemSize===4,ot=!!ce.attributes.tangent&&(!!te.normalMap||te.anisotropy>0),Le=!!ce.morphAttributes.position,St=!!ce.morphAttributes.normal,Kt=!!ce.morphAttributes.color;let Nt=oi;te.toneMapped&&(se===null||se.isXRRenderTarget===!0)&&(Nt=C.toneMapping);const Pt=ce.morphAttributes.position||ce.morphAttributes.normal||ce.morphAttributes.color,gn=Pt!==void 0?Pt.length:0,Re=Q.get(te),Sn=S.state.lights;if(Ve===!0&&(tt===!0||E!==ee)){const It=E===ee&&te.id===$;J.setState(te,E,It)}let pt=!1;te.version===Re.__version?(Re.needsLights&&Re.lightsStateVersion!==Sn.state.version||Re.outputColorSpace!==Ae||ne.isBatchedMesh&&Re.batching===!1||!ne.isBatchedMesh&&Re.batching===!0||ne.isBatchedMesh&&Re.batchingColor===!0&&ne._colorsTexture===null||ne.isBatchedMesh&&Re.batchingColor===!1&&ne._colorsTexture!==null||ne.isInstancedMesh&&Re.instancing===!1||!ne.isInstancedMesh&&Re.instancing===!0||ne.isSkinnedMesh&&Re.skinning===!1||!ne.isSkinnedMesh&&Re.skinning===!0||ne.isInstancedMesh&&Re.instancingColor===!0&&ne.instanceColor===null||ne.isInstancedMesh&&Re.instancingColor===!1&&ne.instanceColor!==null||ne.isInstancedMesh&&Re.instancingMorph===!0&&ne.morphTexture===null||ne.isInstancedMesh&&Re.instancingMorph===!1&&ne.morphTexture!==null||Re.envMap!==ze||te.fog===!0&&Re.fog!==Ee||Re.numClippingPlanes!==void 0&&(Re.numClippingPlanes!==J.numPlanes||Re.numIntersection!==J.numIntersection)||Re.vertexAlphas!==nt||Re.vertexTangents!==ot||Re.morphTargets!==Le||Re.morphNormals!==St||Re.morphColors!==Kt||Re.toneMapping!==Nt||Re.morphTargetsCount!==gn||!!Re.lightProbeGrid!=S.state.lightProbeGridArray.length>0)&&(pt=!0):(pt=!0,Re.__version=te.version);let $n=Re.currentProgram;pt===!0&&($n=wi(te,W,ne),D&&te.isNodeMaterial&&D.onUpdateProgram(te,$n,Re));let bi=!1,Qi=!1,wr=!1;const Rt=$n.getUniforms(),qt=Re.uniforms;if(b.useProgram($n.program)&&(bi=!0,Qi=!0,wr=!0),te.id!==$&&($=te.id,Qi=!0),Re.needsLights){const It=cb(S.state.lightProbeGridArray,ne);Re.lightProbeGrid!==It&&(Re.lightProbeGrid=It,Qi=!0)}if(bi||ee!==E){b.buffers.depth.getReversed()&&E.reversedDepth!==!0&&(E._reversedDepth=!0,E.updateProjectionMatrix()),Rt.setValue(G,"projectionMatrix",E.projectionMatrix),Rt.setValue(G,"viewMatrix",E.matrixWorldInverse);const ts=Rt.map.cameraPosition;ts!==void 0&&ts.setValue(G,at.setFromMatrixPosition(E.matrixWorld)),N.logarithmicDepthBuffer&&Rt.setValue(G,"logDepthBufFC",2/(Math.log(E.far+1)/Math.LN2)),(te.isMeshPhongMaterial||te.isMeshToonMaterial||te.isMeshLambertMaterial||te.isMeshBasicMaterial||te.isMeshStandardMaterial||te.isShaderMaterial)&&Rt.setValue(G,"isOrthographic",E.isOrthographicCamera===!0),ee!==E&&(ee=E,Qi=!0,wr=!0)}if(Re.needsLights&&(Sn.state.sunShadowMap.length>0&&Rt.setValue(G,"sunShadowMap",Sn.state.sunShadowMap,he),Sn.state.directionalShadowMap.length>0&&Rt.setValue(G,"directionalShadowMap",Sn.state.directionalShadowMap,he),Sn.state.spotShadowMap.length>0&&Rt.setValue(G,"spotShadowMap",Sn.state.spotShadowMap,he),Sn.state.pointShadowMap.length>0&&Rt.setValue(G,"pointShadowMap",Sn.state.pointShadowMap,he)),ne.isSkinnedMesh){Rt.setOptional(G,ne,"bindMatrix"),Rt.setOptional(G,ne,"bindMatrixInverse");const It=ne.skeleton;It&&(It.boneTexture===null&&It.computeBoneTexture(),Rt.setValue(G,"boneTexture",It.boneTexture,he))}ne.isBatchedMesh&&(Rt.setOptional(G,ne,"batchingTexture"),Rt.setValue(G,"batchingTexture",ne._matricesTexture,he),Rt.setOptional(G,ne,"batchingIdTexture"),Rt.setValue(G,"batchingIdTexture",ne._indirectTexture,he),Rt.setOptional(G,ne,"batchingColorTexture"),ne._colorsTexture!==null&&Rt.setValue(G,"batchingColorTexture",ne._colorsTexture,he));const es=ce.morphAttributes;if((es.position!==void 0||es.normal!==void 0||es.color!==void 0)&&I.update(ne,ce,$n),(Qi||Re.receiveShadow!==ne.receiveShadow)&&(Re.receiveShadow=ne.receiveShadow,Rt.setValue(G,"receiveShadow",ne.receiveShadow)),(te.isMeshStandardMaterial||te.isMeshLambertMaterial||te.isMeshPhongMaterial)&&te.envMap===null&&W.environment!==null&&(qt.envMapIntensity.value=W.environmentIntensity),qt.dfgLUT!==void 0&&(qt.dfgLUT.value=ay()),Qi){if(Rt.setValue(G,"toneMappingExposure",C.toneMappingExposure),Re.needsLights&&ub(qt,wr),Ee&&te.fog===!0&&O.refreshFogUniforms(qt,Ee),O.refreshMaterialUniforms(qt,te,le,re,S.state.transmissionRenderTarget[E.id]),Re.needsLights&&Re.lightProbeGrid){const It=Re.lightProbeGrid;qt.probesSH.value=It.texture,qt.probesMin.value.copy(It.boundingBox.min),qt.probesMax.value.copy(It.boundingBox.max),qt.probesResolution.value.copy(It.resolution)}Do.upload(G,Sr(Re),qt,he)}if(te.isShaderMaterial&&te.uniformsNeedUpdate===!0&&(Do.upload(G,Sr(Re),qt,he),te.uniformsNeedUpdate=!1),te.isSpriteMaterial&&Rt.setValue(G,"center",ne.center),Rt.setValue(G,"modelViewMatrix",ne.modelViewMatrix),Rt.setValue(G,"normalMatrix",ne.normalMatrix),Rt.setValue(G,"modelMatrix",ne.matrixWorld),te.uniformsGroups!==void 0){const It=te.uniformsGroups;for(let ts=0,br=It.length;ts<br;ts++){const Kp=It[ts];de.update(Kp,$n),de.bind(Kp,$n)}}return $n}function ub(E,W){E.ambientLightColor.needsUpdate=W,E.lightProbe.needsUpdate=W,E.sunLights.needsUpdate=W,E.sunLightShadows.needsUpdate=W,E.directionalLights.needsUpdate=W,E.directionalLightShadows.needsUpdate=W,E.pointLights.needsUpdate=W,E.pointLightShadows.needsUpdate=W,E.spotLights.needsUpdate=W,E.spotLightShadows.needsUpdate=W,E.rectAreaLights.needsUpdate=W,E.hemisphereLights.needsUpdate=W}function fb(E){return E.isMeshLambertMaterial||E.isMeshToonMaterial||E.isMeshPhongMaterial||E.isMeshStandardMaterial||E.isShadowMaterial||E.isShaderMaterial&&E.lights===!0}this.getActiveCubeFace=function(){return V},this.getActiveMipmapLevel=function(){return q},this.getRenderTarget=function(){return se},this.setRenderTargetTextures=function(E,W,ce){const te=Q.get(E);te.__autoAllocateDepthBuffer=E.resolveDepthBuffer===!1,te.__autoAllocateDepthBuffer===!1&&(te.__useRenderToTexture=!1),Q.get(E.texture).__webglTexture=W,Q.get(E.depthTexture).__webglTexture=te.__autoAllocateDepthBuffer?void 0:ce,te.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(E,W){const ce=Q.get(E);ce.__webglFramebuffer=W,ce.__useDefaultFramebuffer=W===void 0},this.setRenderTarget=function(E,W=0,ce=0){se=E,V=W,q=ce;let te=null,ne=!1,Ee=!1;if(E){const Ae=Q.get(E);if(Ae.__useDefaultFramebuffer!==void 0){b.bindFramebuffer(G.FRAMEBUFFER,Ae.__webglFramebuffer),ue.copy(E.viewport),ve.copy(E.scissor),Me=E.scissorTest,b.viewport(ue),b.scissor(ve),b.setScissorTest(Me),$=-1;return}else if(Ae.__webglFramebuffer===void 0)he.setupRenderTarget(E);else if(Ae.__hasExternalTextures)he.rebindTextures(E,Q.get(E.texture).__webglTexture,Q.get(E.depthTexture).__webglTexture);else if(E.depthBuffer){const nt=E.depthTexture;if(Ae.__boundDepthTexture!==nt){if(nt!==null&&Q.has(nt)&&(E.width!==nt.image.width||E.height!==nt.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");he.setupDepthRenderbuffer(E)}}const Ie=E.texture;(Ie.isData3DTexture||Ie.isDataArrayTexture||Ie.isCompressedArrayTexture)&&(Ee=!0);const ze=Q.get(E).__webglFramebuffer;E.isWebGLCubeRenderTarget?(Array.isArray(ze[W])?te=ze[W][ce]:te=ze[W],ne=!0):E.samples>0&&he.useMultisampledRTT(E)===!1?te=Q.get(E).__webglMultisampledFramebuffer:Array.isArray(ze)?te=ze[ce]:te=ze,ue.copy(E.viewport),ve.copy(E.scissor),Me=E.scissorTest}else ue.copy(we).multiplyScalar(le).floor(),ve.copy(Ge).multiplyScalar(le).floor(),Me=Et;if(ce!==0&&(te=U),b.bindFramebuffer(G.FRAMEBUFFER,te)&&b.drawBuffers(E,te),b.viewport(ue),b.scissor(ve),b.setScissorTest(Me),ne){const Ae=Q.get(E.texture);G.framebufferTexture2D(G.FRAMEBUFFER,G.COLOR_ATTACHMENT0,G.TEXTURE_CUBE_MAP_POSITIVE_X+W,Ae.__webglTexture,ce)}else if(Ee){const Ae=W;for(let Ie=0;Ie<E.textures.length;Ie++){const ze=Q.get(E.textures[Ie]);G.framebufferTextureLayer(G.FRAMEBUFFER,G.COLOR_ATTACHMENT0+Ie,ze.__webglTexture,ce,Ae)}}else if(E!==null&&ce!==0){const Ae=Q.get(E.texture);G.framebufferTexture2D(G.FRAMEBUFFER,G.COLOR_ATTACHMENT0,G.TEXTURE_2D,Ae.__webglTexture,ce)}$=-1};function $p(E){const W=Q.get(E);return(W.__readFormat!==E.format||W.__readType!==E.type)&&(W.__readFormat=E.format,W.__readType=E.type,W.__formatReadable=N.textureFormatReadable(E.format),W.__typeReadable=N.textureTypeReadable(E.type)),W}this.readRenderTargetPixels=function(E,W,ce,te,ne,Ee,Pe,Ae=0){if(!(E&&E.isWebGLRenderTarget)){He("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Ie=Q.get(E).__webglFramebuffer;if(E.isWebGLCubeRenderTarget&&Pe!==void 0&&(Ie=Ie[Pe]),Ie){b.bindFramebuffer(G.FRAMEBUFFER,Ie);try{const ze=E.textures[Ae],nt=ze.format,ot=ze.type;E.textures.length>1&&G.readBuffer(G.COLOR_ATTACHMENT0+Ae);const Le=$p(ze);if(Le.__formatReadable===!1){He("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(Le.__typeReadable===!1){He("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}W>=0&&W<=E.width-te&&ce>=0&&ce<=E.height-ne&&G.readPixels(W,ce,te,ne,me.convert(nt),me.convert(ot),Ee)}finally{const ze=se!==null?Q.get(se).__webglFramebuffer:null;b.bindFramebuffer(G.FRAMEBUFFER,ze)}}},this.readRenderTargetPixelsAsync=async function(E,W,ce,te,ne,Ee,Pe,Ae=0){if(!(E&&E.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Ie=Q.get(E).__webglFramebuffer;if(E.isWebGLCubeRenderTarget&&Pe!==void 0&&(Ie=Ie[Pe]),Ie)if(W>=0&&W<=E.width-te&&ce>=0&&ce<=E.height-ne){b.bindFramebuffer(G.FRAMEBUFFER,Ie);const ze=E.textures[Ae],nt=ze.format,ot=ze.type;E.textures.length>1&&G.readBuffer(G.COLOR_ATTACHMENT0+Ae);const Le=$p(ze);if(Le.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(Le.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const St=G.createBuffer();G.bindBuffer(G.PIXEL_PACK_BUFFER,St),G.bufferData(G.PIXEL_PACK_BUFFER,Ee.byteLength,G.STREAM_READ),G.readPixels(W,ce,te,ne,me.convert(nt),me.convert(ot),0),G.bindBuffer(G.PIXEL_PACK_BUFFER,null);const Kt=se!==null?Q.get(se).__webglFramebuffer:null;b.bindFramebuffer(G.FRAMEBUFFER,Kt);const Nt=G.fenceSync(G.SYNC_GPU_COMMANDS_COMPLETE,0);return G.flush(),await Im(G,Nt,4),G.bindBuffer(G.PIXEL_PACK_BUFFER,St),G.getBufferSubData(G.PIXEL_PACK_BUFFER,0,Ee),G.bindBuffer(G.PIXEL_PACK_BUFFER,null),G.deleteBuffer(St),G.deleteSync(Nt),Ee}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(E,W=null,ce=0){const te=Math.pow(2,-ce),ne=Math.floor(E.image.width*te),Ee=Math.floor(E.image.height*te),Pe=W!==null?W.x:0,Ae=W!==null?W.y:0;he.setTexture2D(E,0),G.copyTexSubImage2D(G.TEXTURE_2D,ce,0,0,Pe,Ae,ne,Ee),b.unbindTexture()},this.copyTextureToTexture=function(E,W,ce=null,te=null,ne=0,Ee=0){let Pe,Ae,Ie,ze,nt,ot,Le,St,Kt;const Nt=E.isCompressedTexture?E.mipmaps[Ee]:E.image;if(ce!==null)Pe=ce.max.x-ce.min.x,Ae=ce.max.y-ce.min.y,Ie=ce.isBox3?ce.max.z-ce.min.z:1,ze=ce.min.x,nt=ce.min.y,ot=ce.isBox3?ce.min.z:0;else{const qt=Math.pow(2,-ne);Pe=Math.floor(Nt.width*qt),Ae=Math.floor(Nt.height*qt),E.isDataArrayTexture?Ie=Nt.depth:E.isData3DTexture?Ie=Math.floor(Nt.depth*qt):Ie=1,ze=0,nt=0,ot=0}te!==null?(Le=te.x,St=te.y,Kt=te.z):(Le=0,St=0,Kt=0);const Pt=me.convert(W.format),gn=me.convert(W.type);let Re;W.isData3DTexture?(he.setTexture3D(W,0),Re=G.TEXTURE_3D):W.isDataArrayTexture||W.isCompressedArrayTexture?(he.setTexture2DArray(W,0),Re=G.TEXTURE_2D_ARRAY):(he.setTexture2D(W,0),Re=G.TEXTURE_2D),b.activeTexture(G.TEXTURE0),b.pixelStorei(G.UNPACK_FLIP_Y_WEBGL,W.flipY),b.pixelStorei(G.UNPACK_PREMULTIPLY_ALPHA_WEBGL,W.premultiplyAlpha),b.pixelStorei(G.UNPACK_ALIGNMENT,W.unpackAlignment);const Sn=b.getParameter(G.UNPACK_ROW_LENGTH),pt=b.getParameter(G.UNPACK_IMAGE_HEIGHT),$n=b.getParameter(G.UNPACK_SKIP_PIXELS),bi=b.getParameter(G.UNPACK_SKIP_ROWS),Qi=b.getParameter(G.UNPACK_SKIP_IMAGES);b.pixelStorei(G.UNPACK_ROW_LENGTH,Nt.width),b.pixelStorei(G.UNPACK_IMAGE_HEIGHT,Nt.height),b.pixelStorei(G.UNPACK_SKIP_PIXELS,ze),b.pixelStorei(G.UNPACK_SKIP_ROWS,nt),b.pixelStorei(G.UNPACK_SKIP_IMAGES,ot);const wr=E.isDataArrayTexture||E.isData3DTexture,Rt=W.isDataArrayTexture||W.isData3DTexture;if(E.isDepthTexture){const qt=Q.get(E),es=Q.get(W),It=Q.get(qt.__renderTarget),ts=Q.get(es.__renderTarget);b.bindFramebuffer(G.READ_FRAMEBUFFER,It.__webglFramebuffer),b.bindFramebuffer(G.DRAW_FRAMEBUFFER,ts.__webglFramebuffer);for(let br=0;br<Ie;br++)wr&&(G.framebufferTextureLayer(G.READ_FRAMEBUFFER,G.COLOR_ATTACHMENT0,Q.get(E).__webglTexture,ne,ot+br),G.framebufferTextureLayer(G.DRAW_FRAMEBUFFER,G.COLOR_ATTACHMENT0,Q.get(W).__webglTexture,Ee,Kt+br)),G.blitFramebuffer(ze,nt,Pe,Ae,Le,St,Pe,Ae,G.DEPTH_BUFFER_BIT,G.NEAREST);b.bindFramebuffer(G.READ_FRAMEBUFFER,null),b.bindFramebuffer(G.DRAW_FRAMEBUFFER,null)}else if(ne!==0||E.isRenderTargetTexture||Q.has(E)){const qt=Q.get(E),es=Q.get(W);b.bindFramebuffer(G.READ_FRAMEBUFFER,R),b.bindFramebuffer(G.DRAW_FRAMEBUFFER,B);for(let It=0;It<Ie;It++)wr?G.framebufferTextureLayer(G.READ_FRAMEBUFFER,G.COLOR_ATTACHMENT0,qt.__webglTexture,ne,ot+It):G.framebufferTexture2D(G.READ_FRAMEBUFFER,G.COLOR_ATTACHMENT0,G.TEXTURE_2D,qt.__webglTexture,ne),Rt?G.framebufferTextureLayer(G.DRAW_FRAMEBUFFER,G.COLOR_ATTACHMENT0,es.__webglTexture,Ee,Kt+It):G.framebufferTexture2D(G.DRAW_FRAMEBUFFER,G.COLOR_ATTACHMENT0,G.TEXTURE_2D,es.__webglTexture,Ee),ne!==0?G.blitFramebuffer(ze,nt,Pe,Ae,Le,St,Pe,Ae,G.COLOR_BUFFER_BIT,G.NEAREST):Rt?G.copyTexSubImage3D(Re,Ee,Le,St,Kt+It,ze,nt,Pe,Ae):G.copyTexSubImage2D(Re,Ee,Le,St,ze,nt,Pe,Ae);b.bindFramebuffer(G.READ_FRAMEBUFFER,null),b.bindFramebuffer(G.DRAW_FRAMEBUFFER,null)}else Rt?E.isDataTexture||E.isData3DTexture?G.texSubImage3D(Re,Ee,Le,St,Kt,Pe,Ae,Ie,Pt,gn,Nt.data):W.isCompressedArrayTexture?G.compressedTexSubImage3D(Re,Ee,Le,St,Kt,Pe,Ae,Ie,Pt,Nt.data):G.texSubImage3D(Re,Ee,Le,St,Kt,Pe,Ae,Ie,Pt,gn,Nt):E.isDataTexture?G.texSubImage2D(G.TEXTURE_2D,Ee,Le,St,Pe,Ae,Pt,gn,Nt.data):E.isCompressedTexture?G.compressedTexSubImage2D(G.TEXTURE_2D,Ee,Le,St,Nt.width,Nt.height,Pt,Nt.data):G.texSubImage2D(G.TEXTURE_2D,Ee,Le,St,Pe,Ae,Pt,gn,Nt);b.pixelStorei(G.UNPACK_ROW_LENGTH,Sn),b.pixelStorei(G.UNPACK_IMAGE_HEIGHT,pt),b.pixelStorei(G.UNPACK_SKIP_PIXELS,$n),b.pixelStorei(G.UNPACK_SKIP_ROWS,bi),b.pixelStorei(G.UNPACK_SKIP_IMAGES,Qi),Ee===0&&W.generateMipmaps&&G.generateMipmap(Re),b.unbindTexture()},this.initRenderTarget=function(E){Q.get(E).__webglFramebuffer===void 0&&he.setupRenderTarget(E)},this.initTexture=function(E){E.isCubeTexture?he.setTextureCube(E,0):E.isData3DTexture?he.setTexture3D(E,0):E.isDataArrayTexture||E.isCompressedArrayTexture?he.setTexture2DArray(E,0):he.setTexture2D(E,0),b.unbindTexture()},this.resetState=function(){V=0,q=0,se=null,b.reset(),_e.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return ci}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;const t=this.getContext();t.drawingBufferColorSpace=st._getDrawingBufferColorSpace(e),t.unpackColorSpace=st._getUnpackColorSpace()}}const Xd={type:"change"},gh={type:"start"},Yd={type:"end"},No=new Gs,qd=new ui,ly=Math.cos(70*Wa.DEG2RAD),en=new L,Tn=2*Math.PI,Tt={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},xh=1e-6;class cy extends Gg{constructor(e,t=null){super(e,t),this.state=Tt.NONE,this.target=new L,this.cursor=new L,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:wn.ROTATE,MIDDLE:wn.DOLLY,RIGHT:wn.PAN},this.touches={ONE:Kn.ROTATE,TWO:Kn.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._cursorStyle="auto",this._domElementKeyEvents=null,this._lastPosition=new L,this._lastQuaternion=new Jt,this._lastTargetPosition=new L,this._quat=new Jt().setFromUnitVectors(e.up,new L(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new fd,this._sphericalDelta=new fd,this._scale=1,this._panOffset=new L,this._rotateStart=new pe,this._rotateEnd=new pe,this._rotateDelta=new pe,this._panStart=new pe,this._panEnd=new pe,this._panDelta=new pe,this._dollyStart=new pe,this._dollyEnd=new pe,this._dollyDelta=new pe,this._dollyDirection=new L,this._mouse=new pe,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=uy.bind(this),this._onPointerDown=hy.bind(this),this._onPointerUp=fy.bind(this),this._onContextMenu=_y.bind(this),this._onMouseWheel=my.bind(this),this._onKeyDown=gy.bind(this),this._onTouchStart=xy.bind(this),this._onTouchMove=vy.bind(this),this._onMouseDown=dy.bind(this),this._onMouseMove=py.bind(this),this._interceptControlDown=My.bind(this),this._interceptControlUp=yy.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}set cursorStyle(e){this._cursorStyle=e,e==="grab"?this.domElement.style.cursor="grab":this.domElement.style.cursor="auto"}get cursorStyle(){return this._cursorStyle}connect(e){super.connect(e),this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.state=Tt.NONE,this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.ownerDocument.removeEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents();const e=this.domElement.getRootNode();e.removeEventListener("keydown",this._interceptControlDown,{capture:!0}),e.removeEventListener("keyup",this._interceptControlUp,{capture:!0}),this._controlActive=!1,this._pointers.length=0,this._pointerPositions={},this.domElement.style.touchAction="",this.domElement.style.cursor="auto"}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(Xd),this.update(),this.state=Tt.NONE}pan(e,t){this._pan(e,t),this.update()}dollyIn(e){this._dollyIn(e),this.update()}dollyOut(e){this._dollyOut(e),this.update()}rotateLeft(e){this._rotateLeft(e),this.update()}rotateUp(e){this._rotateUp(e),this.update()}update(e=null){const t=this.object.position;en.copy(t).sub(this.target),en.applyQuaternion(this._quat),this._spherical.setFromVector3(en),this.autoRotate&&this.state===Tt.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,i=this.maxAzimuthAngle;isFinite(n)&&isFinite(i)&&(n<-Math.PI?n+=Tn:n>Math.PI&&(n-=Tn),i<-Math.PI?i+=Tn:i>Math.PI&&(i-=Tn),n<=i?this._spherical.theta=Math.max(n,Math.min(i,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+i)/2?Math.max(n,this._spherical.theta):Math.min(i,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let r=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{const a=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),r=a!=this._spherical.radius}if(en.setFromSpherical(this._spherical),en.applyQuaternion(this._quatInverse),t.copy(this.target).add(en),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let a=null;if(this.object.isPerspectiveCamera){const o=en.length();a=this._clampDistance(o*this._scale);const l=o-a;this.object.position.addScaledVector(this._dollyDirection,l),this.object.updateMatrixWorld(),r=!!l}else if(this.object.isOrthographicCamera){const o=new L(this._mouse.x,this._mouse.y,0);o.unproject(this.object);const l=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),r=l!==this.object.zoom;const c=new L(this._mouse.x,this._mouse.y,0);c.unproject(this.object),this.object.position.sub(c).add(o),this.object.updateMatrixWorld(),a=en.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;a!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(a).add(this.object.position):(No.origin.copy(this.object.position),No.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(No.direction))<ly?this.object.lookAt(this.target):(qd.setFromNormalAndCoplanarPoint(this.object.up,this.target),No.intersectPlane(qd,this.target))))}else if(this.object.isOrthographicCamera){const a=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),a!==this.object.zoom&&(this.object.updateProjectionMatrix(),r=!0)}return this._scale=1,this._performCursorZoom=!1,r||this._lastPosition.distanceToSquared(this.object.position)>xh||8*(1-this._lastQuaternion.dot(this.object.quaternion))>xh||this._lastTargetPosition.distanceToSquared(this.target)>xh?(this.dispatchEvent(Xd),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e!==null?Tn/60*this.autoRotateSpeed*e:Tn/60/60*this.autoRotateSpeed}_getZoomScale(e){const t=Math.abs(e*.01);return Math.pow(.95,this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){en.setFromMatrixColumn(t,0),en.multiplyScalar(-e),this._panOffset.add(en)}_panUp(e,t){this.screenSpacePanning===!0?en.setFromMatrixColumn(t,1):(en.setFromMatrixColumn(t,0),en.crossVectors(this.object.up,en)),en.multiplyScalar(e),this._panOffset.add(en)}_pan(e,t){const n=this.domElement;if(this.object.isPerspectiveCamera){const i=this.object.position;en.copy(i).sub(this.target);let r=en.length();r*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*r/n.clientHeight,this.object.matrix),this._panUp(2*t*r/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;const n=this.domElement.getBoundingClientRect(),i=e-n.left,r=t-n.top,a=n.width,o=n.height;this._mouse.x=i/a*2-1,this._mouse.y=-(r/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientX),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const t=this.domElement;this._rotateLeft(Tn*this._rotateDelta.x/t.clientHeight),this._rotateUp(Tn*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(Tn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-Tn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(Tn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-Tn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0;break}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{const t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),i=.5*(e.pageY+t.y);this._rotateStart.set(n,i)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{const t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),i=.5*(e.pageY+t.y);this._panStart.set(n,i)}}_handleTouchStartDolly(e){const t=this._getSecondPointerPosition(e),n=e.pageX-t.x,i=e.pageY-t.y,r=Math.sqrt(n*n+i*i);this._dollyStart.set(0,r)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{const n=this._getSecondPointerPosition(e),i=.5*(e.pageX+n.x),r=.5*(e.pageY+n.y);this._rotateEnd.set(i,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const t=this.domElement;this._rotateLeft(Tn*this._rotateDelta.x/t.clientHeight),this._rotateUp(Tn*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{const t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),i=.5*(e.pageY+t.y);this._panEnd.set(n,i)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){const t=this._getSecondPointerPosition(e),n=e.pageX-t.x,i=e.pageY-t.y,r=Math.sqrt(n*n+i*i);this._dollyEnd.set(0,r),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);const a=(e.pageX+t.x)*.5,o=(e.pageY+t.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new pe,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){const t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){const t=e.deltaMode,n={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100;break}return e.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}}function hy(s){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(s.pointerId),this.domElement.ownerDocument.addEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(s)&&(this._addPointer(s),s.pointerType==="touch"?this._onTouchStart(s):this._onMouseDown(s),this._cursorStyle==="grab"&&(this.domElement.style.cursor="grabbing")))}function uy(s){this.enabled!==!1&&(s.pointerType==="touch"?this._onTouchMove(s):this._onMouseMove(s))}function fy(s){switch(this._removePointer(s),this._pointers.length){case 0:this.domElement.releasePointerCapture(s.pointerId),this.domElement.ownerDocument.removeEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(Yd),this.state=Tt.NONE,this._cursorStyle==="grab"&&(this.domElement.style.cursor="grab");break;case 1:const e=this._pointers[0],t=this._pointerPositions[e];this._onTouchStart({pointerId:e,pageX:t.x,pageY:t.y});break}}function dy(s){let e;switch(s.button){case 0:e=this.mouseButtons.LEFT;break;case 1:e=this.mouseButtons.MIDDLE;break;case 2:e=this.mouseButtons.RIGHT;break;default:e=-1}switch(e){case wn.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(s),this.state=Tt.DOLLY;break;case wn.ROTATE:if(s.ctrlKey||s.metaKey||s.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(s),this.state=Tt.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(s),this.state=Tt.ROTATE}break;case wn.PAN:if(s.ctrlKey||s.metaKey||s.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(s),this.state=Tt.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(s),this.state=Tt.PAN}break;default:this.state=Tt.NONE}this.state!==Tt.NONE&&this.dispatchEvent(gh)}function py(s){switch(this.state){case Tt.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(s);break;case Tt.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(s);break;case Tt.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(s);break}}function my(s){this.enabled===!1||this.enableZoom===!1||this.state!==Tt.NONE||(s.preventDefault(),this.dispatchEvent(gh),this._handleMouseWheel(this._customWheelEvent(s)),this.dispatchEvent(Yd))}function gy(s){this.enabled!==!1&&this._handleKeyDown(s)}function xy(s){switch(this._trackPointer(s),this._pointers.length){case 1:switch(this.touches.ONE){case Kn.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(s),this.state=Tt.TOUCH_ROTATE;break;case Kn.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(s),this.state=Tt.TOUCH_PAN;break;default:this.state=Tt.NONE}break;case 2:switch(this.touches.TWO){case Kn.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(s),this.state=Tt.TOUCH_DOLLY_PAN;break;case Kn.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(s),this.state=Tt.TOUCH_DOLLY_ROTATE;break;default:this.state=Tt.NONE}break;default:this.state=Tt.NONE}this.state!==Tt.NONE&&this.dispatchEvent(gh)}function vy(s){switch(this._trackPointer(s),this.state){case Tt.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(s),this.update();break;case Tt.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(s),this.update();break;case Tt.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(s),this.update();break;case Tt.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(s),this.update();break;default:this.state=Tt.NONE}}function _y(s){this.enabled!==!1&&s.preventDefault()}function My(s){s.key==="Control"&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function yy(s){s.key==="Control"&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}const us={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

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


		}`};class fs{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}}const Sy=new ua(-1,1,1,-1,0,1);class wy extends At{constructor(){super(),this.setAttribute("position",new je([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new je([0,2,0,0,2,0],2))}}const by=new wy;class zo{constructor(e){this._mesh=new $e(by,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,Sy)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}}class Ty extends fs{constructor(e,t="tDiffuse"){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof gt?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=ii.clone(e.uniforms),this.material=new gt({name:e.name!==void 0?e.name:"unspecified",defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new zo(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}}class Zd extends fs{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){const i=e.getContext(),r=e.state;r.buffers.color.setMask(!1),r.buffers.depth.setMask(!1),r.buffers.color.setLocked(!0),r.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),r.buffers.stencil.setTest(!0),r.buffers.stencil.setOp(i.REPLACE,i.REPLACE,i.REPLACE),r.buffers.stencil.setFunc(i.ALWAYS,a,4294967295),r.buffers.stencil.setClear(o),r.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),r.buffers.color.setLocked(!1),r.buffers.depth.setLocked(!1),r.buffers.color.setMask(!0),r.buffers.depth.setMask(!0),r.buffers.stencil.setLocked(!1),r.buffers.stencil.setFunc(i.EQUAL,1,4294967295),r.buffers.stencil.setOp(i.KEEP,i.KEEP,i.KEEP),r.buffers.stencil.setLocked(!0)}}class Ay extends fs{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}}class Ey{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){const n=e.getSize(new pe);this._width=n.width,this._height=n.height,t=new on(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:un}),t.texture.name="EffectComposer.rt1"}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Ty(us),this.copyPass.material.blending=an,this.timer=new Ig}swapBuffers(){const e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){const t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());const t=this.renderer.getRenderTarget();let n=!1;for(let i=0,r=this.passes.length;i<r;i++){const a=this.passes[i];if(a.enabled!==!1){if(a.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(i),a.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),a.needsSwap){if(n){const o=this.renderer.getContext(),l=this.renderer.state.buffers.stencil;l.setFunc(o.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),l.setFunc(o.EQUAL,1,4294967295)}this.swapBuffers()}Zd!==void 0&&(a instanceof Zd?n=!0:a instanceof Ay&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){const t=this.renderer.getSize(new pe);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;const n=this._width*this._pixelRatio,i=this._height*this._pixelRatio;this.renderTarget1.setSize(n,i),this.renderTarget2.setSize(n,i);for(let r=0;r<this.passes.length;r++)this.passes[r].setSize(n,i)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}}class Cy extends fs{constructor(e,t,n=null,i=null,r=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=i,this.clearAlpha=r,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new ge}render(e,t,n){const i=e.autoClear;e.autoClear=!1;let r,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(r=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==!0&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(r),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=i}}const Ry={uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new ge(0)},defaultOpacity:{value:0}},vertexShader:`

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

		}`};class rr extends fs{constructor(e,t=1,n,i){super(),this.strength=t,this.radius=n,this.threshold=i,this.resolution=e!==void 0?new pe(e.x,e.y):new pe(256,256),this.clearColor=new ge(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let r=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new on(r,a,{type:un,depthBuffer:!1}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let h=0;h<this.nMips;h++){const d=new on(r,a,{type:un,depthBuffer:!1});d.texture.name="UnrealBloomPass.h"+h,d.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(d);const u=new on(r,a,{type:un,depthBuffer:!1});u.texture.name="UnrealBloomPass.v"+h,u.texture.generateMipmaps=!1,this.renderTargetsVertical.push(u),r=Math.round(r/2),a=Math.round(a/2)}const o=Ry;this.highPassUniforms=ii.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=i,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new gt({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];const l=[6,10,14,18,22];r=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let h=0;h<this.nMips;h++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(l[h])),this.separableBlurMaterials[h].uniforms.invSize.value=new pe(1/r,1/a),r=Math.round(r/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;const c=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=c,this.bloomTintColors=[new L(1,1,1),new L(1,1,1),new L(1,1,1),new L(1,1,1),new L(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=ii.clone(us.uniforms),this.blendMaterial=new gt({uniforms:this.copyUniforms,vertexShader:us.vertexShader,fragmentShader:us.fragmentShader,premultipliedAlpha:!0,blending:Jn,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new ge,this._oldClearAlpha=1,this._basic=new Dt,this._fsQuad=new zo(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),i=Math.round(t/2);this.renderTargetBright.setSize(n,i);for(let r=0;r<this.nMips;r++)this.renderTargetsHorizontal[r].setSize(n,i),this.renderTargetsVertical[r].setSize(n,i),this.separableBlurMaterials[r].uniforms.invSize.value=new pe(1/n,1/i),n=Math.round(n/2),i=Math.round(i/2)}render(e,t,n,i,r){e.getClearColor(this._oldClearColor),this._oldClearAlpha=e.getClearAlpha();const a=e.autoClear;e.autoClear=!1,e.setClearColor(this.clearColor,0),r&&e.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=n.texture,e.setRenderTarget(null),e.clear(),this._fsQuad.render(e)),this.highPassUniforms.tDiffuse.value=n.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,e.setRenderTarget(this.renderTargetBright),e.clear(),this._fsQuad.render(e);let o=this.renderTargetBright;for(let l=0;l<this.nMips;l++)this._fsQuad.material=this.separableBlurMaterials[l],this.separableBlurMaterials[l].uniforms.colorTexture.value=o.texture,this.separableBlurMaterials[l].uniforms.direction.value=rr.BlurDirectionX,e.setRenderTarget(this.renderTargetsHorizontal[l]),e.clear(),this._fsQuad.render(e),this.separableBlurMaterials[l].uniforms.colorTexture.value=this.renderTargetsHorizontal[l].texture,this.separableBlurMaterials[l].uniforms.direction.value=rr.BlurDirectionY,e.setRenderTarget(this.renderTargetsVertical[l]),e.clear(),this._fsQuad.render(e),o=this.renderTargetsVertical[l];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,e.setRenderTarget(this.renderTargetsHorizontal[0]),e.clear(),this._fsQuad.render(e),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,r&&e.state.buffers.stencil.setTest(!0),this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(n),this._fsQuad.render(e)),e.setClearColor(this._oldClearColor,this._oldClearAlpha),e.autoClear=a}_getSeparableBlurMaterial(e){const t=[],n=e/3;for(let a=0;a<e;a++)t.push(.39894*Math.exp(-.5*a*a/(n*n))/n);const i=[],r=[];for(let a=1;a<e;a+=2){const o=t[a],l=a+1<e?t[a+1]:0,c=o+l;i.push((a*o+(a+1)*l)/c),r.push(c)}return new gt({defines:{KERNEL_PAIRS:i.length},uniforms:{colorTexture:{value:null},invSize:{value:new pe(.5,.5)},direction:{value:new pe(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:i},gaussianWeights:{value:r}},vertexShader:`

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

				}`})}_getCompositeMaterial(e){return new gt({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

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

				}`})}}rr.BlurDirectionX=new pe(1,0),rr.BlurDirectionY=new pe(0,1);const Fo={name:"OutputShader",uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
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

		}`};class Py extends fs{constructor(){super(),this.isOutputPass=!0,this.uniforms=ii.clone(Fo.uniforms),this.material=new Kf({name:Fo.name,uniforms:this.uniforms,vertexShader:Fo.vertexShader,fragmentShader:Fo.fragmentShader}),this._fsQuad=new zo(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},st.getTransfer(this._outputColorSpace)===_t&&(this.material.defines.SRGB_TRANSFER=""),this._toneMapping===xl?this.material.defines.LINEAR_TONE_MAPPING="":this._toneMapping===vl?this.material.defines.REINHARD_TONE_MAPPING="":this._toneMapping===_l?this.material.defines.CINEON_TONE_MAPPING="":this._toneMapping===Pa?this.material.defines.ACES_FILMIC_TONE_MAPPING="":this._toneMapping===yl?this.material.defines.AGX_TONE_MAPPING="":this._toneMapping===Sl?this.material.defines.NEUTRAL_TONE_MAPPING="":this._toneMapping===Ml&&(this.material.defines.CUSTOM_TONE_MAPPING=""),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}}const Oo={defines:{PERSPECTIVE_CAMERA:1,SAMPLES:16,NORMAL_VECTOR_TYPE:1,DEPTH_SWIZZLING:"x",SCREEN_SPACE_RADIUS:0,SCREEN_SPACE_RADIUS_SCALE:100,SCENE_CLIP_BOX:0},uniforms:{tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new pe},cameraNear:{value:null},cameraFar:{value:null},cameraProjectionMatrix:{value:new De},cameraProjectionMatrixInverse:{value:new De},cameraWorldMatrix:{value:new De},radius:{value:.25},distanceExponent:{value:1},thickness:{value:1},distanceFallOff:{value:1},scale:{value:1},sceneBoxMin:{value:new L(-1,-1,-1)},sceneBoxMax:{value:new L(1,1,1)}},vertexShader:`

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
		}`},Bo={defines:{PERSPECTIVE_CAMERA:1},uniforms:{tDepth:{value:null},cameraNear:{value:null},cameraFar:{value:null}},vertexShader:`
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

		}`},vh={uniforms:{tDiffuse:{value:null},intensity:{value:1}},vertexShader:`
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
		}`};function Iy(s=5){const e=Math.floor(s)%2===0?Math.floor(s)+1:Math.floor(s),t=Ly(e),n=t.length,i=new Uint8Array(n*4);for(let a=0;a<n;++a){const o=t[a],l=2*Math.PI*o/n,c=new L(Math.cos(l),Math.sin(l),0).normalize();i[a*4]=(c.x*.5+.5)*255,i[a*4+1]=(c.y*.5+.5)*255,i[a*4+2]=127,i[a*4+3]=255}const r=new Ws(i,e,e);return r.wrapS=bn,r.wrapT=bn,r.needsUpdate=!0,r}function Ly(s){const e=Math.floor(s)%2===0?Math.floor(s)+1:Math.floor(s),t=e*e,n=Array(t).fill(0);let i=Math.floor(e/2),r=e-1;for(let a=1;a<=t;){if(i===-1&&r===e?(r=e-2,i=0):(r===e&&(r=0),i<0&&(i=e-1)),n[i*e+r]!==0){r-=2,i++;continue}else n[i*e+r]=a++;r++,i--}return n}const ko={defines:{SAMPLES:16,SAMPLE_VECTORS:$d(16,2,1),NORMAL_VECTOR_TYPE:1,DEPTH_VALUE_SOURCE:0},uniforms:{tDiffuse:{value:null},tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new pe},cameraProjectionMatrixInverse:{value:new De},lumaPhi:{value:5},depthPhi:{value:5},normalPhi:{value:5},radius:{value:4},index:{value:0}},vertexShader:`

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
		}`};function $d(s,e,t){const n=Dy(s,e,t);let i="vec3[SAMPLES](";for(let r=0;r<s;r++){const a=n[r];i+=`vec3(${a.x}, ${a.y}, ${a.z})${r<s-1?",":")"}`}return i}function Dy(s,e,t){const n=[];for(let i=0;i<s;i++){const r=2*Math.PI*e*i/s,a=Math.pow(i/(s-1),t);n.push(new L(Math.cos(r),Math.sin(r),a))}return n}class Uy{constructor(e=Math){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],this.grad4=[[0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],[0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],[1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],[-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],[1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],[-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],[1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],[-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]],this.p=[];for(let t=0;t<256;t++)this.p[t]=Math.floor(e.random()*256);this.perm=[];for(let t=0;t<512;t++)this.perm[t]=this.p[t&255];this.simplex=[[0,1,2,3],[0,1,3,2],[0,0,0,0],[0,2,3,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,3,0],[0,2,1,3],[0,0,0,0],[0,3,1,2],[0,3,2,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,3,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,0,3],[0,0,0,0],[1,3,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,3,0,1],[2,3,1,0],[1,0,2,3],[1,0,3,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,3,1],[0,0,0,0],[2,1,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,1,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,1,2],[3,0,2,1],[0,0,0,0],[3,1,2,0],[2,1,0,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,1,0,2],[0,0,0,0],[3,2,0,1],[3,2,1,0]]}noise(e,t){let n,i,r;const a=.5*(Math.sqrt(3)-1),o=(e+t)*a,l=Math.floor(e+o),c=Math.floor(t+o),h=(3-Math.sqrt(3))/6,d=(l+c)*h,u=l-d,f=c-d,m=e-u,_=t-f;let p,g;m>_?(p=1,g=0):(p=0,g=1);const v=m-p+h,M=_-g+h,x=m-1+2*h,w=_-1+2*h,S=l&255,A=c&255,y=this.perm[S+this.perm[A]]%12,T=this.perm[S+p+this.perm[A+g]]%12,C=this.perm[S+1+this.perm[A+1]]%12;let P=.5-m*m-_*_;P<0?n=0:(P*=P,n=P*P*this._dot(this.grad3[y],m,_));let D=.5-v*v-M*M;D<0?i=0:(D*=D,i=D*D*this._dot(this.grad3[T],v,M));let U=.5-x*x-w*w;return U<0?r=0:(U*=U,r=U*U*this._dot(this.grad3[C],x,w)),70*(n+i+r)}noise3d(e,t,n){let i,r,a,o;const c=(e+t+n)*.3333333333333333,h=Math.floor(e+c),d=Math.floor(t+c),u=Math.floor(n+c),f=1/6,m=(h+d+u)*f,_=h-m,p=d-m,g=u-m,v=e-_,M=t-p,x=n-g;let w,S,A,y,T,C;v>=M?M>=x?(w=1,S=0,A=0,y=1,T=1,C=0):v>=x?(w=1,S=0,A=0,y=1,T=0,C=1):(w=0,S=0,A=1,y=1,T=0,C=1):M<x?(w=0,S=0,A=1,y=0,T=1,C=1):v<x?(w=0,S=1,A=0,y=0,T=1,C=1):(w=0,S=1,A=0,y=1,T=1,C=0);const P=v-w+f,D=M-S+f,U=x-A+f,R=v-y+2*f,B=M-T+2*f,V=x-C+2*f,q=v-1+3*f,se=M-1+3*f,$=x-1+3*f,ee=h&255,ue=d&255,ve=u&255,Me=this.perm[ee+this.perm[ue+this.perm[ve]]]%12,Xe=this.perm[ee+w+this.perm[ue+S+this.perm[ve+A]]]%12,Oe=this.perm[ee+y+this.perm[ue+T+this.perm[ve+C]]]%12,Ue=this.perm[ee+1+this.perm[ue+1+this.perm[ve+1]]]%12;let re=.6-v*v-M*M-x*x;re<0?i=0:(re*=re,i=re*re*this._dot3(this.grad3[Me],v,M,x));let le=.6-P*P-D*D-U*U;le<0?r=0:(le*=le,r=le*le*this._dot3(this.grad3[Xe],P,D,U));let ye=.6-R*R-B*B-V*V;ye<0?a=0:(ye*=ye,a=ye*ye*this._dot3(this.grad3[Oe],R,B,V));let Ne=.6-q*q-se*se-$*$;return Ne<0?o=0:(Ne*=Ne,o=Ne*Ne*this._dot3(this.grad3[Ue],q,se,$)),32*(i+r+a+o)}noise4d(e,t,n,i){const r=this.grad4,a=this.simplex,o=this.perm,l=(Math.sqrt(5)-1)/4,c=(5-Math.sqrt(5))/20;let h,d,u,f,m;const _=(e+t+n+i)*l,p=Math.floor(e+_),g=Math.floor(t+_),v=Math.floor(n+_),M=Math.floor(i+_),x=(p+g+v+M)*c,w=p-x,S=g-x,A=v-x,y=M-x,T=e-w,C=t-S,P=n-A,D=i-y,U=T>C?32:0,R=T>P?16:0,B=C>P?8:0,V=T>D?4:0,q=C>D?2:0,se=P>D?1:0,$=U+R+B+V+q+se,ee=a[$][0]>=3?1:0,ue=a[$][1]>=3?1:0,ve=a[$][2]>=3?1:0,Me=a[$][3]>=3?1:0,Xe=a[$][0]>=2?1:0,Oe=a[$][1]>=2?1:0,Ue=a[$][2]>=2?1:0,re=a[$][3]>=2?1:0,le=a[$][0]>=1?1:0,ye=a[$][1]>=1?1:0,Ne=a[$][2]>=1?1:0,we=a[$][3]>=1?1:0,Ge=T-ee+c,Et=C-ue+c,qe=P-ve+c,Ve=D-Me+c,tt=T-Xe+2*c,Ye=C-Oe+2*c,at=P-Ue+2*c,yt=D-re+2*c,kt=T-le+3*c,it=C-ye+3*c,dt=P-Ne+3*c,G=D-we+3*c,zt=T-1+4*c,Ke=C-1+4*c,N=P-1+4*c,b=D-1+4*c,Z=p&255,Q=g&255,he=v&255,k=M&255,K=o[Z+o[Q+o[he+o[k]]]]%32,Y=o[Z+ee+o[Q+ue+o[he+ve+o[k+Me]]]]%32,ie=o[Z+Xe+o[Q+Oe+o[he+Ue+o[k+re]]]]%32,xe=o[Z+le+o[Q+ye+o[he+Ne+o[k+we]]]]%32,O=o[Z+1+o[Q+1+o[he+1+o[k+1]]]]%32;let z=.6-T*T-C*C-P*P-D*D;z<0?h=0:(z*=z,h=z*z*this._dot4(r[K],T,C,P,D));let X=.6-Ge*Ge-Et*Et-qe*qe-Ve*Ve;X<0?d=0:(X*=X,d=X*X*this._dot4(r[Y],Ge,Et,qe,Ve));let J=.6-tt*tt-Ye*Ye-at*at-yt*yt;J<0?u=0:(J*=J,u=J*J*this._dot4(r[ie],tt,Ye,at,yt));let fe=.6-kt*kt-it*it-dt*dt-G*G;fe<0?f=0:(fe*=fe,f=fe*fe*this._dot4(r[xe],kt,it,dt,G));let oe=.6-zt*zt-Ke*Ke-N*N-b*b;return oe<0?m=0:(oe*=oe,m=oe*oe*this._dot4(r[O],zt,Ke,N,b)),27*(h+d+u+f+m)}_dot(e,t,n){return e[0]*t+e[1]*n}_dot3(e,t,n,i){return e[0]*t+e[1]*n+e[2]*i}_dot4(e,t,n,i,r){return e[0]*t+e[1]*n+e[2]*i+e[3]*r}}class xi extends fs{constructor(e,t,n=512,i=512,r,a,o){super(),this.width=n,this.height=i,this.clear=!0,this.camera=t,this.scene=e,this.output=0,this._renderGBuffer=!0,this._visibilityCache=[],this.blendIntensity=1,this.pdRings=2,this.pdRadiusExponent=2,this.pdSamples=16,this.gtaoNoiseTexture=Iy(),this.pdNoiseTexture=this._generateNoise(),this.gtaoRenderTarget=new on(this.width,this.height,{type:un,depthBuffer:!1}),this.pdRenderTarget=this.gtaoRenderTarget.clone(),this.gtaoMaterial=new gt({defines:Object.assign({},Oo.defines),uniforms:ii.clone(Oo.uniforms),vertexShader:Oo.vertexShader,fragmentShader:Oo.fragmentShader,blending:an,depthTest:!1,depthWrite:!1}),this.gtaoMaterial.defines.PERSPECTIVE_CAMERA=this.camera.isPerspectiveCamera?1:0,this.gtaoMaterial.uniforms.tNoise.value=this.gtaoNoiseTexture,this.gtaoMaterial.uniforms.resolution.value.set(this.width,this.height),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.normalMaterial=new sg,this.normalMaterial.blending=an,this.pdMaterial=new gt({defines:Object.assign({},ko.defines),uniforms:ii.clone(ko.uniforms),vertexShader:ko.vertexShader,fragmentShader:ko.fragmentShader,depthTest:!1,depthWrite:!1}),this.pdMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.pdMaterial.uniforms.tNoise.value=this.pdNoiseTexture,this.pdMaterial.uniforms.resolution.value.set(this.width,this.height),this.pdMaterial.uniforms.lumaPhi.value=10,this.pdMaterial.uniforms.depthPhi.value=2,this.pdMaterial.uniforms.normalPhi.value=3,this.pdMaterial.uniforms.radius.value=8,this.depthRenderMaterial=new gt({defines:Object.assign({},Bo.defines),uniforms:ii.clone(Bo.uniforms),vertexShader:Bo.vertexShader,fragmentShader:Bo.fragmentShader,blending:an}),this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.copyMaterial=new gt({uniforms:ii.clone(us.uniforms),vertexShader:us.vertexShader,fragmentShader:us.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blendSrc:ll,blendDst:Er,blendEquation:ai,blendSrcAlpha:ol,blendDstAlpha:Er,blendEquationAlpha:ai}),this.blendMaterial=new gt({uniforms:ii.clone(vh.uniforms),vertexShader:vh.vertexShader,fragmentShader:vh.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blending:Mu,blendSrc:ll,blendDst:Er,blendEquation:ai,blendSrcAlpha:ol,blendDstAlpha:Er,blendEquationAlpha:ai}),this._fsQuad=new zo(null),this._originalClearColor=new ge,this.setGBuffer(r?r.depthTexture:void 0,r?r.normalTexture:void 0),a!==void 0&&this.updateGtaoMaterial(a),o!==void 0&&this.updatePdMaterial(o)}setSize(e,t){this.width=e,this.height=t,this.gtaoRenderTarget.setSize(e,t),this.normalRenderTarget.setSize(e,t),this.pdRenderTarget.setSize(e,t),this.gtaoMaterial.uniforms.resolution.value.set(e,t),this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.pdMaterial.uniforms.resolution.value.set(e,t),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse)}dispose(){this.gtaoNoiseTexture.dispose(),this.pdNoiseTexture.dispose(),this.normalRenderTarget.dispose(),this.gtaoRenderTarget.dispose(),this.pdRenderTarget.dispose(),this.normalMaterial.dispose(),this.pdMaterial.dispose(),this.copyMaterial.dispose(),this.depthRenderMaterial.dispose(),this._fsQuad.dispose()}get gtaoMap(){return this.pdRenderTarget.texture}setGBuffer(e,t){e!==void 0?(this.depthTexture=e,this.normalTexture=t,this._renderGBuffer=!1):(this.depthTexture=new Ys,this.depthTexture.format=Vi,this.depthTexture.type=Ts,this.normalRenderTarget=new on(this.width,this.height,{minFilter:Ht,magFilter:Ht,type:un,depthTexture:this.depthTexture}),this.normalTexture=this.normalRenderTarget.texture,this._renderGBuffer=!0);const n=this.normalTexture?1:0,i=this.depthTexture===this.normalTexture?"w":"x";this.gtaoMaterial.defines.NORMAL_VECTOR_TYPE=n,this.gtaoMaterial.defines.DEPTH_SWIZZLING=i,this.gtaoMaterial.uniforms.tNormal.value=this.normalTexture,this.gtaoMaterial.uniforms.tDepth.value=this.depthTexture,this.pdMaterial.defines.NORMAL_VECTOR_TYPE=n,this.pdMaterial.defines.DEPTH_SWIZZLING=i,this.pdMaterial.uniforms.tNormal.value=this.normalTexture,this.pdMaterial.uniforms.tDepth.value=this.depthTexture,this.depthRenderMaterial.uniforms.tDepth.value=this.normalRenderTarget.depthTexture}setSceneClipBox(e){e?(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX!==1,this.gtaoMaterial.defines.SCENE_CLIP_BOX=1,this.gtaoMaterial.uniforms.sceneBoxMin.value.copy(e.min),this.gtaoMaterial.uniforms.sceneBoxMax.value.copy(e.max)):(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX===0,this.gtaoMaterial.defines.SCENE_CLIP_BOX=0)}updateGtaoMaterial(e){e.radius!==void 0&&(this.gtaoMaterial.uniforms.radius.value=e.radius),e.distanceExponent!==void 0&&(this.gtaoMaterial.uniforms.distanceExponent.value=e.distanceExponent),e.thickness!==void 0&&(this.gtaoMaterial.uniforms.thickness.value=e.thickness),e.distanceFallOff!==void 0&&(this.gtaoMaterial.uniforms.distanceFallOff.value=e.distanceFallOff,this.gtaoMaterial.needsUpdate=!0),e.scale!==void 0&&(this.gtaoMaterial.uniforms.scale.value=e.scale),e.samples!==void 0&&e.samples!==this.gtaoMaterial.defines.SAMPLES&&(this.gtaoMaterial.defines.SAMPLES=e.samples,this.gtaoMaterial.needsUpdate=!0),e.screenSpaceRadius!==void 0&&(e.screenSpaceRadius?1:0)!==this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS&&(this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS=e.screenSpaceRadius?1:0,this.gtaoMaterial.needsUpdate=!0)}updatePdMaterial(e){let t=!1;e.lumaPhi!==void 0&&(this.pdMaterial.uniforms.lumaPhi.value=e.lumaPhi),e.depthPhi!==void 0&&(this.pdMaterial.uniforms.depthPhi.value=e.depthPhi),e.normalPhi!==void 0&&(this.pdMaterial.uniforms.normalPhi.value=e.normalPhi),e.radius!==void 0&&e.radius!==this.radius&&(this.pdMaterial.uniforms.radius.value=e.radius),e.radiusExponent!==void 0&&e.radiusExponent!==this.pdRadiusExponent&&(this.pdRadiusExponent=e.radiusExponent,t=!0),e.rings!==void 0&&e.rings!==this.pdRings&&(this.pdRings=e.rings,t=!0),e.samples!==void 0&&e.samples!==this.pdSamples&&(this.pdSamples=e.samples,t=!0),t&&(this.pdMaterial.defines.SAMPLES=this.pdSamples,this.pdMaterial.defines.SAMPLE_VECTORS=$d(this.pdSamples,this.pdRings,this.pdRadiusExponent),this.pdMaterial.needsUpdate=!0)}render(e,t,n){switch(this._renderGBuffer&&(this._overrideVisibility(),this._renderOverride(e,this.normalMaterial,this.normalRenderTarget,7829503,1),this._restoreVisibility()),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.gtaoMaterial.uniforms.cameraWorldMatrix.value.copy(this.camera.matrixWorld),this._renderPass(e,this.gtaoMaterial,this.gtaoRenderTarget,16777215,1),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this._renderPass(e,this.pdMaterial,this.pdRenderTarget,16777215,1),this.output){case xi.OUTPUT.Off:break;case xi.OUTPUT.Diffuse:this.copyMaterial.uniforms.tDiffuse.value=n.texture,this.copyMaterial.blending=an,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case xi.OUTPUT.AO:this.copyMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.copyMaterial.blending=an,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case xi.OUTPUT.Denoise:this.copyMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.copyMaterial.blending=an,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case xi.OUTPUT.Depth:this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this._renderPass(e,this.depthRenderMaterial,this.renderToScreen?null:t);break;case xi.OUTPUT.Normal:this.copyMaterial.uniforms.tDiffuse.value=this.normalRenderTarget.texture,this.copyMaterial.blending=an,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case xi.OUTPUT.Default:this.copyMaterial.uniforms.tDiffuse.value=n.texture,this.copyMaterial.blending=an,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:t),this.blendMaterial.uniforms.intensity.value=this.blendIntensity,this.blendMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this._renderPass(e,this.blendMaterial,this.renderToScreen?null:t);break;default:console.warn("THREE.GTAOPass: Unknown output type.")}}_renderPass(e,t,n,i,r){e.getClearColor(this._originalClearColor);const a=e.getClearAlpha(),o=e.autoClear;e.setRenderTarget(n),e.autoClear=!1,i!=null&&(e.setClearColor(i),e.setClearAlpha(r||0),e.clear()),this._fsQuad.material=t,this._fsQuad.render(e),e.autoClear=o,e.setClearColor(this._originalClearColor),e.setClearAlpha(a)}_renderOverride(e,t,n,i,r){e.getClearColor(this._originalClearColor);const a=e.getClearAlpha(),o=e.autoClear;e.setRenderTarget(n),e.autoClear=!1,i=t.clearColor||i,r=t.clearAlpha||r,i!=null&&(e.setClearColor(i),e.setClearAlpha(r||0),e.clear()),this.scene.overrideMaterial=t,e.render(this.scene,this.camera),this.scene.overrideMaterial=null,e.autoClear=o,e.setClearColor(this._originalClearColor),e.setClearAlpha(a)}_overrideVisibility(){const e=this.scene,t=this._visibilityCache;e.traverse(function(n){(n.isPoints||n.isLine||n.isLine2)&&n.visible&&(n.visible=!1,t.push(n))})}_restoreVisibility(){const e=this._visibilityCache;for(let t=0;t<e.length;t++)e[t].visible=!0;e.length=0}_generateNoise(e=64){const t=new Uy,n=e*e*4,i=new Uint8Array(n);for(let a=0;a<e;a++)for(let o=0;o<e;o++){const l=a,c=o;i[(a*e+o)*4]=(t.noise(l,c)*.5+.5)*255,i[(a*e+o)*4+1]=(t.noise(l+e,c)*.5+.5)*255,i[(a*e+o)*4+2]=(t.noise(l,c+e)*.5+.5)*255,i[(a*e+o)*4+3]=(t.noise(l+e,c+e)*.5+.5)*255}const r=new Ws(i,e,e,Cn,vn);return r.wrapS=bn,r.wrapT=bn,r.needsUpdate=!0,r}}xi.OUTPUT={Off:-1,Default:0,Diffuse:1,Depth:2,Normal:3,AO:4,Denoise:5};class Vo extends $e{constructor(e,t={}){super(e),this.isReflector=!0,this.type="Reflector",this.forceUpdate=!1,this._reflectionCameras=new WeakMap;const n=this,i=t.color!==void 0?new ge(t.color):new ge(8355711),r=t.textureWidth||512,a=t.textureHeight||512,o=t.clipBias||0,l=t.shader||Vo.ReflectorShader,c=t.multisample!==void 0?t.multisample:4,h=new ui,d=new L,u=new L,f=new L,m=new De,_=new L(0,0,-1),p=new Mt,g=new L,v=new L,M=new Mt,x=new De,w=new on(r,a,{samples:c,type:un}),S=new gt({name:l.name!==void 0?l.name:"unspecified",uniforms:ii.clone(l.uniforms),fragmentShader:l.fragmentShader,vertexShader:l.vertexShader});S.uniforms.tDiffuse.value=w.texture,S.uniforms.color.value=i,S.uniforms.textureMatrix.value=x,this.material=S,this.onBeforeRender=function(A,y,T){const C=this.getReflectionCamera(T);if(u.setFromMatrixPosition(n.matrixWorld),f.setFromMatrixPosition(T.matrixWorld),m.extractRotation(n.matrixWorld),d.set(0,0,1),d.applyMatrix4(m),g.subVectors(u,f),g.dot(d)>0===!0&&this.forceUpdate===!1)return;g.reflect(d).negate(),g.add(u),m.extractRotation(T.matrixWorld),_.set(0,0,-1),_.applyMatrix4(m),_.add(f),v.subVectors(u,_),v.reflect(d).negate(),v.add(u),C.position.copy(g),C.up.set(0,1,0),C.up.applyMatrix4(m),C.up.reflect(d),C.lookAt(v),C.far=T.far,C.updateMatrixWorld(),C.projectionMatrix.copy(T.projectionMatrix),x.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),x.multiply(C.projectionMatrix),x.multiply(C.matrixWorldInverse),x.multiply(n.matrixWorld),h.setFromNormalAndCoplanarPoint(d,u),h.applyMatrix4(C.matrixWorldInverse),p.set(h.normal.x,h.normal.y,h.normal.z,h.constant);const D=C.projectionMatrix;C.isOrthographicCamera?(M.x=(Math.sign(p.x)+D.elements[8])/D.elements[0],M.y=(Math.sign(p.y)+D.elements[9])/D.elements[5],M.z=-T.far,M.w=1):(M.x=(Math.sign(p.x)+D.elements[8])/D.elements[0],M.y=(Math.sign(p.y)+D.elements[9])/D.elements[5],M.z=-1,M.w=(1+D.elements[10])/D.elements[14]),p.multiplyScalar(2/p.dot(M)),D.elements[2]=p.x,D.elements[6]=p.y,C.isOrthographicCamera?(D.elements[10]=p.z-o,D.elements[14]=p.w-1):(D.elements[10]=p.z+1-o,D.elements[14]=p.w),n.visible=!1;const U=A.getRenderTarget(),R=A.xr.enabled,B=A.shadowMap.autoUpdate;A.xr.enabled=!1,A.shadowMap.autoUpdate=!1,A.setRenderTarget(w),A.state.buffers.depth.setMask(!0),A.autoClear===!1&&A.clear(),A.render(y,C),A.xr.enabled=R,A.shadowMap.autoUpdate=B,A.setRenderTarget(U);const V=T.viewport;V!==void 0&&A.state.viewport(V),n.visible=!0,this.forceUpdate=!1},this.getRenderTarget=function(){return w},this.dispose=function(){w.dispose(),n.material.dispose()},this.getReflectionCamera=function(A){let y=this._reflectionCameras.get(A);return y===void 0&&(y=A.clone(),this._reflectionCameras.set(A,y)),y}}}Vo.ReflectorShader={name:"ReflectorShader",uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null}},vertexShader:`
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

		}`};const Ny={name:"miami",skyTop:"#2b1f6b",skyMid:"#e0529c",skyHorizon:"#ffb072",fog:"#ffa98a",hemiSky:"#ffc9e6",hemiGround:"#9a80d6",hemiIntensity:.55,sunColor:"#ffd9bd",sunIntensity:2.4,sunAzimuthDeg:-60,sunElevationDeg:16,skySunAzimuthDeg:43,exposure:1.18,water:{deep:"#1a86c4",shallow:"#52dbe0",sky:"#ff9ccf"},waterFog:[1500,4200],skyImage:"dusk",skyGrade:{top:"#6b3fb0",horizon:"#ff9a6b",amount:.62},ground:{sea:[28,110,150],sand:[250,232,200],lawn:[118,208,156],grass:[84,180,132],rock:[190,150,170]},neon:!0,vegetation:"palm",trunk:"#a98462",foliage:"#2fbf77",streetTreeSpacing:17,harnesses:{"claude-code":{wall:"#ffd2c4",roof:"#ff6f9f",accent:"#ff6f6f",park:"#7fd6a4"},codex:{wall:"#c4f4f6",roof:"#3cc3d2",accent:"#27c4d6",park:"#7fd6a4"},dsh:{wall:"#c8f7e0",roof:"#45d0a2",accent:"#34d29c",park:"#7fd6a4"},"plugin:zcode":{wall:"#e3d2ff",roof:"#9a6cf5",accent:"#9a6bff",park:"#7fd6a4"},"minimax-code":{wall:"#ffc9ea",roof:"#ea58ac",accent:"#ff5cb8",park:"#7fd6a4"}},fallback:{wall:"#f6e6cf",roof:"#d9a98c",accent:"#e8a07a",park:"#86d6a6"}};function _h(s){return(s.skySunAzimuthDeg-s.sunAzimuthDeg)/360}function xt(){return Ny}const Kd={tropical:{ground:{sand:[255,241,208],lawn:[104,204,138],grass:[74,178,118]},groundAmount:.75,water:{shallow:"#5fe0d0",deep:"#0f8fb8"},waterAmount:.65},temperate:{ground:{},groundAmount:0,water:null,waterAmount:0},boreal:{ground:{sand:[170,162,146],lawn:[84,118,92],grass:[62,96,74],rock:[128,128,126]},groundAmount:.8,water:{shallow:"#7da4b4",deep:"#1c4258"},waterAmount:.65},savanna:{ground:{sand:[228,192,128],lawn:[186,172,98],grass:[164,150,84],rock:[168,128,96]},groundAmount:.8,water:{shallow:"#7cc7b0",deep:"#2f7f78"},waterAmount:.6},eastasian:{ground:{lawn:[118,176,108],grass:[92,150,96]},groundAmount:.7,water:{shallow:"#8fd6bf",deep:"#2c8a86"},waterAmount:.65}};function zy(s,e){const t=Kd[e];if(!t||!t.groundAmount)return s.ground;const n=(i,r)=>r?[i[0]+(r[0]-i[0])*t.groundAmount,i[1]+(r[1]-i[1])*t.groundAmount,i[2]+(r[2]-i[2])*t.groundAmount]:i;return{sea:s.ground.sea,sand:n(s.ground.sand,t.ground.sand),lawn:n(s.ground.lawn,t.ground.lawn),grass:n(s.ground.grass,t.ground.grass),rock:n(s.ground.rock,t.ground.rock)}}var Fy=""+new URL("sky-day-DsUYkHks.jpg",self.location.href).href,Oy=""+new URL("sky-dusk-DSNBmG6c.jpg",self.location.href).href,By=""+new URL("ground-asphalt-02-color-BhE3js6e.jpg",self.location.href).href,ky=""+new URL("ground-asphalt-02-normal-DPv0hN4H.jpg",self.location.href).href,Vy=""+new URL("ground-concrete-pavement-02-color-DRU_d7tg.jpg",self.location.href).href,Hy=""+new URL("ground-concrete-pavement-02-normal-m8ZlwENj.jpg",self.location.href).href,Gy=""+new URL("ground-coast-sand-01-color-AHSd4EQa.jpg",self.location.href).href,Wy=""+new URL("ground-coast-sand-01-normal-DBCTmcYI.jpg",self.location.href).href,Xy=""+new URL("ground-brown-mud-02-color-BjjqeKTs.jpg",self.location.href).href,Yy=""+new URL("ground-brown-mud-02-normal-DxFqgKtH.jpg",self.location.href).href,qy=""+new URL("ground-aerial-grass-rock-color-C-dQy7KR.jpg",self.location.href).href,Zy=""+new URL("ground-aerial-grass-rock-normal-XalvtT5d.jpg",self.location.href).href,$y=""+new URL("facade-glass-Cp7NdxSs.jpg",self.location.href).href,Ky=""+new URL("facade-commercial-CsukDcwb.jpg",self.location.href).href,Jy=""+new URL("facade-banded-CmkM4c_w.jpg",self.location.href).href,jy=""+new URL("stucco-normal-C8Fw9Ngo.jpg",self.location.href).href,Qy=""+new URL("water-normal-DZ6Y1iJI.jpg",self.location.href).href;let Ho=null;function eS(){if(Ho)return Ho;const s=typeof document>"u",e=s?new cd().setOptions({imageOrientation:"flipY"}):null,t=s?null:new id,n=(a,o,l=!0)=>(e?e.loadAsync(a).then(c=>{const h=new Ft(c);return h.flipY=!1,h.needsUpdate=!0,h}):t.loadAsync(a)).then(c=>(c.colorSpace=o?Wt:Ei,l&&(c.wrapS=c.wrapT=bn),c.anisotropy=8,c)),i=a=>n(a,!0,!1).then(o=>(o.mapping=Ia,o.wrapS=bn,o)),r=(a,o)=>Promise.all([n(a,!0),n(o,!1)]).then(([l,c])=>({color:l,normal:c}));return Ho=Promise.all([i(Fy),i(Oy),r(By,ky),r(Vy,Hy),r(Gy,Wy),r(Xy,Yy),r(qy,Zy),n(Jy,!0),n(Ky,!0),n($y,!0),n(jy,!1),n(Qy,!1)]).then(([a,o,l,c,h,d,u,f,m,_,p,g])=>({sky:{day:a,dusk:o},ground:{asphalt:l,concrete:c,sand:h,mud:d,grass:u},facades:[f,m,_],stuccoNormal:p,waterNormal:g})).catch(a=>(console.warn("[city] texture assets unavailable, keeping procedural look",a),null)),Ho}function Mh(s,e=!1){const t=s[0].index!==null,n=new Set(Object.keys(s[0].attributes)),i=new Set(Object.keys(s[0].morphAttributes)),r={},a={},o=s[0].morphTargetsRelative,l=new At;let c=0;for(let h=0;h<s.length;++h){const d=s[h];let u=0;if(t!==(d.index!==null))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them."),null;for(const f in d.attributes){if(!n.has(f))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+'. All geometries must have compatible attributes; make sure "'+f+'" attribute exists among all geometries, or in none of them.'),null;r[f]===void 0&&(r[f]=[]),r[f].push(d.attributes[f]),u++}if(u!==n.size)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". Make sure all geometries have the same number of attributes."),null;if(o!==d.morphTargetsRelative)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". .morphTargetsRelative must be consistent throughout all geometries."),null;for(const f in d.morphAttributes){if(!i.has(f))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+".  .morphAttributes must be consistent throughout all geometries."),null;a[f]===void 0&&(a[f]=[]),a[f].push(d.morphAttributes[f])}if(e){let f;if(t)f=d.index.count;else if(d.attributes.position!==void 0)f=d.attributes.position.count;else return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". The geometry must have either an index or a position attribute"),null;l.addGroup(c,f,h),c+=f}}if(t){let h=0;const d=[];for(let u=0;u<s.length;++u){const f=s[u].index;for(let m=0;m<f.count;++m)d.push(f.getX(m)+h);h+=s[u].attributes.position.count}l.setIndex(d)}for(const h in r){const d=Jd(r[h]);if(!d)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+h+" attribute."),null;l.setAttribute(h,d)}for(const h in a){const d=a[h][0].length;if(d!==0){l.morphAttributes=l.morphAttributes||{},l.morphAttributes[h]=[];for(let u=0;u<d;++u){const f=[];for(let _=0;_<a[h].length;++_)f.push(a[h][_][u]);const m=Jd(f);if(!m)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+h+" morphAttribute."),null;l.morphAttributes[h].push(m)}}}return l}function Jd(s){let e,t,n,i=-1,r=0;for(let c=0;c<s.length;++c){const h=s[c];if(e===void 0&&(e=h.array.constructor),e!==h.array.constructor)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes."),null;if(t===void 0&&(t=h.itemSize),t!==h.itemSize)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes."),null;if(n===void 0&&(n=h.normalized),n!==h.normalized)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes."),null;if(i===-1&&(i=h.gpuType),i!==h.gpuType)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes."),null;r+=h.count*t}const a=new e(r),o=new Ot(a,t,n);let l=0;for(let c=0;c<s.length;++c){const h=s[c];if(h.isInterleavedBufferAttribute){const d=l/t;for(let u=0,f=h.count;u<f;u++)for(let m=0;m<t;m++){const _=h.getComponent(u,m);o.setComponent(u+d,m,_)}}else a.set(h.array,l);l+=h.count*t}return i!==void 0&&(o.gpuType=i),o}function jd(s,e){if(e===vm)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),s;if(e===oc||e===zu){let t=s.getIndex();if(t===null){const r=[],a=s.getAttribute("position");if(a!==void 0){for(let o=0;o<a.count;o++)r.push(o);s.setIndex(r),t=s.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),s}const n=t.count-2,i=[];if(e===oc)for(let r=1;r<=n;r++)i.push(t.getX(0)),i.push(t.getX(r)),i.push(t.getX(r+1));else for(let r=0;r<n;r++)r%2===0?(i.push(t.getX(r)),i.push(t.getX(r+1)),i.push(t.getX(r+2))):(i.push(t.getX(r+2)),i.push(t.getX(r+1)),i.push(t.getX(r)));return i.length/3!==n&&console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles."),s.setIndex(i),s.clearGroups(),s}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",e),s}function tS(s){const e=new Map,t=new Map,n=s.clone();return Qd(s,n,function(i,r){e.set(r,i),t.set(i,r)}),n.traverse(function(i){if(!i.isSkinnedMesh)return;const r=i,a=e.get(i),o=a.skeleton.bones;r.skeleton=a.skeleton.clone(),r.bindMatrix.copy(a.bindMatrix),r.skeleton.bones=o.map(function(l){return t.get(l)}),r.bind(r.skeleton,r.bindMatrix)}),n}function Qd(s,e,t){t(s,e);for(let n=0;n<s.children.length;n++)Qd(s.children[n],e.children[n],t)}class nS extends js{constructor(e){super(e),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(t){return new oS(t)}),this.register(function(t){return new lS(t)}),this.register(function(t){return new xS(t)}),this.register(function(t){return new vS(t)}),this.register(function(t){return new _S(t)}),this.register(function(t){return new hS(t)}),this.register(function(t){return new uS(t)}),this.register(function(t){return new fS(t)}),this.register(function(t){return new dS(t)}),this.register(function(t){return new aS(t)}),this.register(function(t){return new pS(t)}),this.register(function(t){return new cS(t)}),this.register(function(t){return new gS(t)}),this.register(function(t){return new mS(t)}),this.register(function(t){return new sS(t)}),this.register(function(t){return new ep(t,rt.EXT_MESHOPT_COMPRESSION)}),this.register(function(t){return new ep(t,rt.KHR_MESHOPT_COMPRESSION)}),this.register(function(t){return new MS(t)})}load(e,t,n,i){const r=this;let a;if(this.resourcePath!=="")a=this.resourcePath;else if(this.path!==""){const c=fa.extractUrlBase(e);a=fa.resolveURL(c,this.path)}else a=fa.extractUrlBase(e);this.manager.itemStart(e);const o=function(c){i?i(c):console.error(c),r.manager.itemError(e),r.manager.itemEnd(e)},l=new nd(this.manager);l.setPath(this.path),l.setResponseType("arraybuffer"),l.setRequestHeader(this.requestHeader),l.setWithCredentials(this.withCredentials),l.load(e,function(c){try{r.parse(c,a,function(h){t(h),r.manager.itemEnd(e)},o)}catch(h){o(h)}},n,o)}setDRACOLoader(e){return this.dracoLoader=e,this}setKTX2Loader(e){return this.ktx2Loader=e,this}setMeshoptDecoder(e){return this.meshoptDecoder=e,this}register(e){return this.pluginCallbacks.indexOf(e)===-1&&this.pluginCallbacks.push(e),this}unregister(e){return this.pluginCallbacks.indexOf(e)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1),this}parse(e,t,n,i){let r;const a={},o={},l=new TextDecoder;if(typeof e=="string")r=JSON.parse(e);else if(e instanceof ArrayBuffer)if(l.decode(new Uint8Array(e,0,4))===tp){try{a[rt.KHR_BINARY_GLTF]=new yS(e)}catch(d){i&&i(d);return}r=JSON.parse(a[rt.KHR_BINARY_GLTF].content)}else r=JSON.parse(l.decode(e));else r=e;if(r.asset===void 0||r.asset.version[0]<2){i&&i(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}const c=new US(r,{path:t||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});c.fileLoader.setRequestHeader(this.requestHeader);for(let h=0;h<this.pluginCallbacks.length;h++){const d=this.pluginCallbacks[h](c);d.name||console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),o[d.name]=d,a[d.name]=!0}if(r.extensionsUsed)for(let h=0;h<r.extensionsUsed.length;++h){const d=r.extensionsUsed[h],u=r.extensionsRequired||[];switch(d){case rt.KHR_MATERIALS_UNLIT:a[d]=new rS;break;case rt.KHR_DRACO_MESH_COMPRESSION:a[d]=new SS(r,this.dracoLoader);break;case rt.KHR_TEXTURE_TRANSFORM:a[d]=new wS;break;case rt.KHR_MESH_QUANTIZATION:a[d]=new bS;break;default:u.indexOf(d)>=0&&o[d]===void 0&&console.warn('THREE.GLTFLoader: Unknown extension "'+d+'".')}}c.setExtensions(a),c.setPlugins(o),c.parse(n,i)}parseAsync(e,t){const n=this;return new Promise(function(i,r){n.parse(e,t,i,r)})}}function iS(){let s={};return{get:function(e){return s[e]},add:function(e,t){s[e]=t},remove:function(e){delete s[e]},removeAll:function(){s={}}}}function Yt(s,e,t){const n=s.json.materials[e];return n.extensions&&n.extensions[t]?n.extensions[t]:null}const rt={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",KHR_MESHOPT_COMPRESSION:"KHR_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"};class sS{constructor(e){this.parser=e,this.name=rt.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){const e=this.parser,t=this.parser.json.nodes||[];for(let n=0,i=t.length;n<i;n++){const r=t[n];r.extensions&&r.extensions[this.name]&&r.extensions[this.name].light!==void 0&&e._addNodeRef(this.cache,r.extensions[this.name].light)}}_loadLight(e){const t=this.parser,n="light:"+e;let i=t.cache.get(n);if(i)return i;const r=t.json,l=((r.extensions&&r.extensions[this.name]||{}).lights||[])[e];let c;const h=new ge(16777215);l.color!==void 0&&h.setRGB(l.color[0],l.color[1],l.color[2],Rn);const d=l.range!==void 0?l.range:0;switch(l.type){case"directional":c=new Ro(h),c.target.position.set(0,0,-1),c.add(c.target);break;case"point":c=new Eg(h),c.distance=d;break;case"spot":c=new Tg(h),c.distance=d,l.spot=l.spot||{},l.spot.innerConeAngle=l.spot.innerConeAngle!==void 0?l.spot.innerConeAngle:0,l.spot.outerConeAngle=l.spot.outerConeAngle!==void 0?l.spot.outerConeAngle:Math.PI/4,c.angle=l.spot.outerConeAngle,c.penumbra=1-l.spot.innerConeAngle/l.spot.outerConeAngle,c.target.position.set(0,0,-1),c.add(c.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+l.type)}return c.position.set(0,0,0),vi(c,l),l.intensity!==void 0&&(c.intensity=l.intensity),c.name=t.createUniqueName(l.name||"light_"+e),i=Promise.resolve(c),t.cache.add(n,i),i}getDependency(e,t){if(e==="light")return this._loadLight(t)}createNodeAttachment(e){const t=this,n=this.parser,r=n.json.nodes[e],o=(r.extensions&&r.extensions[this.name]||{}).light;return o===void 0?null:this._loadLight(o).then(function(l){return n._getNodeRef(t.cache,o,l)})}}class rS{constructor(){this.name=rt.KHR_MATERIALS_UNLIT}getMaterialType(){return Dt}extendParams(e,t,n){const i=[];e.color=new ge(1,1,1),e.opacity=1;const r=t.pbrMetallicRoughness;if(r){if(Array.isArray(r.baseColorFactor)){const a=r.baseColorFactor;e.color.setRGB(a[0],a[1],a[2],Rn),e.opacity=a[3]}r.baseColorTexture!==void 0&&i.push(n.assignTexture(e,"map",r.baseColorTexture,Wt))}return Promise.all(i)}}class aS{constructor(e){this.parser=e,this.name=rt.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,t){const n=Yt(this.parser,e,this.name);return n===null||n.emissiveStrength!==void 0&&(t.emissiveIntensity=n.emissiveStrength),Promise.resolve()}}class oS{constructor(e){this.parser=e,this.name=rt.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){return Yt(this.parser,e,this.name)!==null?di:null}extendMaterialParams(e,t){const n=Yt(this.parser,e,this.name);if(n===null)return Promise.resolve();const i=[];if(n.clearcoatFactor!==void 0&&(t.clearcoat=n.clearcoatFactor),n.clearcoatTexture!==void 0&&i.push(this.parser.assignTexture(t,"clearcoatMap",n.clearcoatTexture)),n.clearcoatRoughnessFactor!==void 0&&(t.clearcoatRoughness=n.clearcoatRoughnessFactor),n.clearcoatRoughnessTexture!==void 0&&i.push(this.parser.assignTexture(t,"clearcoatRoughnessMap",n.clearcoatRoughnessTexture)),n.clearcoatNormalTexture!==void 0&&(i.push(this.parser.assignTexture(t,"clearcoatNormalMap",n.clearcoatNormalTexture)),n.clearcoatNormalTexture.scale!==void 0)){const r=n.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new pe(r,r)}return Promise.all(i)}}class lS{constructor(e){this.parser=e,this.name=rt.KHR_MATERIALS_DISPERSION}getMaterialType(e){return Yt(this.parser,e,this.name)!==null?di:null}extendMaterialParams(e,t){const n=Yt(this.parser,e,this.name);return n===null||(t.dispersion=n.dispersion!==void 0?n.dispersion:0),Promise.resolve()}}class cS{constructor(e){this.parser=e,this.name=rt.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){return Yt(this.parser,e,this.name)!==null?di:null}extendMaterialParams(e,t){const n=Yt(this.parser,e,this.name);if(n===null)return Promise.resolve();const i=[];return n.iridescenceFactor!==void 0&&(t.iridescence=n.iridescenceFactor),n.iridescenceTexture!==void 0&&i.push(this.parser.assignTexture(t,"iridescenceMap",n.iridescenceTexture)),n.iridescenceIor!==void 0&&(t.iridescenceIOR=n.iridescenceIor),t.iridescenceThicknessRange===void 0&&(t.iridescenceThicknessRange=[100,400]),n.iridescenceThicknessMinimum!==void 0&&(t.iridescenceThicknessRange[0]=n.iridescenceThicknessMinimum),n.iridescenceThicknessMaximum!==void 0&&(t.iridescenceThicknessRange[1]=n.iridescenceThicknessMaximum),n.iridescenceThicknessTexture!==void 0&&i.push(this.parser.assignTexture(t,"iridescenceThicknessMap",n.iridescenceThicknessTexture)),Promise.all(i)}}class hS{constructor(e){this.parser=e,this.name=rt.KHR_MATERIALS_SHEEN}getMaterialType(e){return Yt(this.parser,e,this.name)!==null?di:null}extendMaterialParams(e,t){const n=Yt(this.parser,e,this.name);if(n===null)return Promise.resolve();const i=[];if(t.sheenColor=new ge(0,0,0),t.sheenRoughness=0,t.sheen=1,n.sheenColorFactor!==void 0){const r=n.sheenColorFactor;t.sheenColor.setRGB(r[0],r[1],r[2],Rn)}return n.sheenRoughnessFactor!==void 0&&(t.sheenRoughness=n.sheenRoughnessFactor),n.sheenColorTexture!==void 0&&i.push(this.parser.assignTexture(t,"sheenColorMap",n.sheenColorTexture,Wt)),n.sheenRoughnessTexture!==void 0&&i.push(this.parser.assignTexture(t,"sheenRoughnessMap",n.sheenRoughnessTexture)),Promise.all(i)}}class uS{constructor(e){this.parser=e,this.name=rt.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){return Yt(this.parser,e,this.name)!==null?di:null}extendMaterialParams(e,t){const n=Yt(this.parser,e,this.name);if(n===null)return Promise.resolve();const i=[];return n.transmissionFactor!==void 0&&(t.transmission=n.transmissionFactor),n.transmissionTexture!==void 0&&i.push(this.parser.assignTexture(t,"transmissionMap",n.transmissionTexture)),Promise.all(i)}}class fS{constructor(e){this.parser=e,this.name=rt.KHR_MATERIALS_VOLUME}getMaterialType(e){return Yt(this.parser,e,this.name)!==null?di:null}extendMaterialParams(e,t){const n=Yt(this.parser,e,this.name);if(n===null)return Promise.resolve();const i=[];t.thickness=n.thicknessFactor!==void 0?n.thicknessFactor:0,n.thicknessTexture!==void 0&&i.push(this.parser.assignTexture(t,"thicknessMap",n.thicknessTexture)),t.attenuationDistance=n.attenuationDistance||1/0;const r=n.attenuationColor||[1,1,1];return t.attenuationColor=new ge().setRGB(r[0],r[1],r[2],Rn),Promise.all(i)}}class dS{constructor(e){this.parser=e,this.name=rt.KHR_MATERIALS_IOR}getMaterialType(e){return Yt(this.parser,e,this.name)!==null?di:null}extendMaterialParams(e,t){const n=Yt(this.parser,e,this.name);return n===null||(t.ior=n.ior!==void 0?n.ior:1.5,t.ior===0&&(t.ior=1e3)),Promise.resolve()}}class pS{constructor(e){this.parser=e,this.name=rt.KHR_MATERIALS_SPECULAR}getMaterialType(e){return Yt(this.parser,e,this.name)!==null?di:null}extendMaterialParams(e,t){const n=Yt(this.parser,e,this.name);if(n===null)return Promise.resolve();const i=[];t.specularIntensity=n.specularFactor!==void 0?n.specularFactor:1,n.specularTexture!==void 0&&i.push(this.parser.assignTexture(t,"specularIntensityMap",n.specularTexture));const r=n.specularColorFactor||[1,1,1];return t.specularColor=new ge().setRGB(r[0],r[1],r[2],Rn),n.specularColorTexture!==void 0&&i.push(this.parser.assignTexture(t,"specularColorMap",n.specularColorTexture,Wt)),Promise.all(i)}}class mS{constructor(e){this.parser=e,this.name=rt.EXT_MATERIALS_BUMP}getMaterialType(e){return Yt(this.parser,e,this.name)!==null?di:null}extendMaterialParams(e,t){const n=Yt(this.parser,e,this.name);if(n===null)return Promise.resolve();const i=[];return t.bumpScale=n.bumpFactor!==void 0?n.bumpFactor:1,n.bumpTexture!==void 0&&i.push(this.parser.assignTexture(t,"bumpMap",n.bumpTexture)),Promise.all(i)}}class gS{constructor(e){this.parser=e,this.name=rt.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){return Yt(this.parser,e,this.name)!==null?di:null}extendMaterialParams(e,t){const n=Yt(this.parser,e,this.name);if(n===null)return Promise.resolve();const i=[];return n.anisotropyStrength!==void 0&&(t.anisotropy=n.anisotropyStrength),n.anisotropyRotation!==void 0&&(t.anisotropyRotation=n.anisotropyRotation),n.anisotropyTexture!==void 0&&i.push(this.parser.assignTexture(t,"anisotropyMap",n.anisotropyTexture)),Promise.all(i)}}class xS{constructor(e){this.parser=e,this.name=rt.KHR_TEXTURE_BASISU}loadTexture(e){const t=this.parser,n=t.json,i=n.textures[e];if(!i.extensions||!i.extensions[this.name])return null;const r=i.extensions[this.name],a=t.options.ktx2Loader;if(!a){if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return t.loadTextureImage(e,r.source,a)}}class vS{constructor(e){this.parser=e,this.name=rt.EXT_TEXTURE_WEBP}loadTexture(e){const t=this.name,n=this.parser,i=n.json,r=i.textures[e];if(!r.extensions||!r.extensions[t])return null;const a=r.extensions[t],o=i.images[a.source];let l=n.textureLoader;if(o.uri){const c=n.options.manager.getHandler(o.uri);c!==null&&(l=c)}return n.loadTextureImage(e,a.source,l)}}class _S{constructor(e){this.parser=e,this.name=rt.EXT_TEXTURE_AVIF}loadTexture(e){const t=this.name,n=this.parser,i=n.json,r=i.textures[e];if(!r.extensions||!r.extensions[t])return null;const a=r.extensions[t],o=i.images[a.source];let l=n.textureLoader;if(o.uri){const c=n.options.manager.getHandler(o.uri);c!==null&&(l=c)}return n.loadTextureImage(e,a.source,l)}}class ep{constructor(e,t){this.name=t,this.parser=e}loadBufferView(e){const t=this.parser.json,n=t.bufferViews[e];if(n.extensions&&n.extensions[this.name]){const i=n.extensions[this.name],r=this.parser.getDependency("buffer",i.buffer),a=this.parser.options.meshoptDecoder;if(!a||!a.supported){if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return r.then(function(o){const l=i.byteOffset||0,c=i.byteLength||0,h=i.count,d=i.byteStride,u=new Uint8Array(o,l,c);return a.decodeGltfBufferAsync?a.decodeGltfBufferAsync(h,d,u,i.mode,i.filter).then(function(f){return f.buffer}):a.ready.then(function(){const f=new ArrayBuffer(h*d);return a.decodeGltfBuffer(new Uint8Array(f),h,d,u,i.mode,i.filter),f})})}else return null}}class MS{constructor(e){this.name=rt.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){const t=this.parser.json,n=t.nodes[e];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;const i=t.meshes[n.mesh];for(const c of i.primitives)if(c.mode!==Wn.TRIANGLES&&c.mode!==Wn.TRIANGLE_STRIP&&c.mode!==Wn.TRIANGLE_FAN&&c.mode!==void 0)return null;const a=n.extensions[this.name].attributes,o=[],l={};for(const c in a)o.push(this.parser.getDependency("accessor",a[c]).then(h=>(l[c]=h,l[c])));return o.length<1?null:(o.push(this.parser.createNodeMesh(e)),Promise.all(o).then(c=>{const h=c.pop(),d=h.isGroup?h.children:[h],u=c[0].count,f=[];for(const m of d){const _=new De,p=new L,g=new Jt,v=new L(1,1,1),M=new Vt(m.geometry,m.material,u);for(let w=0;w<u;w++)l.TRANSLATION&&p.fromBufferAttribute(l.TRANSLATION,w),l.ROTATION&&g.fromBufferAttribute(l.ROTATION,w),l.SCALE&&v.fromBufferAttribute(l.SCALE,w),M.setMatrixAt(w,_.compose(p,g,v));let x=null;for(const w in l)if(w==="_COLOR_0"){const S=l[w];M.instanceColor=new os(S.array,S.itemSize,S.normalized)}else if(w!=="TRANSLATION"&&w!=="ROTATION"&&w!=="SCALE"){if(x===null){const A=M.geometry;x=new At,x.name=A.name;for(const y in A.attributes)x.setAttribute(y,A.attributes[y]);for(const y in A.morphAttributes)x.morphAttributes[y]=A.morphAttributes[y];A.index!==null&&x.setIndex(A.index),x.morphTargetsRelative=A.morphTargetsRelative;for(const y of A.groups)x.addGroup(y.start,y.count,y.materialIndex);A.boundingBox!==null&&(x.boundingBox=A.boundingBox.clone()),A.boundingSphere!==null&&(x.boundingSphere=A.boundingSphere.clone()),x.drawRange.start=A.drawRange.start,x.drawRange.count=A.drawRange.count,x.userData=Object.assign({},A.userData),M.geometry=x}const S=l[w];x.setAttribute(w,new os(S.array,S.itemSize,S.normalized))}Lt.prototype.copy.call(M,m),this.parser.assignFinalMaterial(M),f.push(M)}return h.isGroup?(h.clear(),h.add(...f),h):f[0]}))}}const tp="glTF",ga=12,np={JSON:1313821514,BIN:5130562};class yS{constructor(e){this.name=rt.KHR_BINARY_GLTF,this.content=null,this.body=null;const t=new DataView(e,0,ga),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==tp)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");const i=this.header.length-ga,r=new DataView(e,ga);let a=0;for(;a<i;){const o=r.getUint32(a,!0);a+=4;const l=r.getUint32(a,!0);if(a+=4,l===np.JSON){const c=new Uint8Array(e,ga+a,o);this.content=n.decode(c)}else if(l===np.BIN){const c=ga+a;this.body=e.slice(c,c+o)}a+=o}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}}class SS{constructor(e,t){if(!t)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=rt.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(e,t){const n=this.json,i=this.dracoLoader,r=e.extensions[this.name].bufferView,a=e.extensions[this.name].attributes,o={},l={},c={};for(const h in a){const d=Sh[h]||h.toLowerCase();o[d]=a[h]}for(const h in e.attributes){const d=Sh[h]||h.toLowerCase();if(a[h]!==void 0){const u=n.accessors[e.attributes[h]],f=ar[u.componentType];c[d]=f.name,l[d]=u.normalized===!0}}return t.getDependency("bufferView",r).then(function(h){return new Promise(function(d,u){i.decodeDracoFile(h,function(f){for(const m in f.attributes){const _=f.attributes[m],p=l[m];p!==void 0&&(_.normalized=p)}d(f)},o,c,Rn,u)})})}}class wS{constructor(){this.name=rt.KHR_TEXTURE_TRANSFORM}extendTexture(e,t){if((t.texCoord===void 0||t.texCoord===e.channel)&&t.offset===void 0&&t.rotation===void 0&&t.scale===void 0)return e;if(e=e.clone(),t.texCoord!==void 0&&(e.channel=t.texCoord),t.offset!==void 0&&e.offset.fromArray(t.offset),t.rotation!==void 0&&(e.rotation=t.rotation),t.scale!==void 0&&e.repeat.fromArray(t.scale),t.rotation!==void 0){const n=Math.cos(e.rotation),i=Math.sin(e.rotation);e.matrix.set(e.repeat.x*n,e.repeat.y*i,e.offset.x,-e.repeat.x*i,e.repeat.y*n,e.offset.y,0,0,1),e.matrixAutoUpdate=!1}return e.needsUpdate=!0,e}}class bS{constructor(){this.name=rt.KHR_MESH_QUANTIZATION}}class ip extends $s{constructor(e,t,n,i){super(e,t,n,i)}copySampleValue_(e){const t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=e*i*3+i;for(let a=0;a!==i;a++)t[a]=n[r+a];return t}interpolate_(e,t,n,i){const r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=o*2,c=o*3,h=i-t,d=(n-t)/h,u=d*d,f=u*d,m=e*c,_=m-c,p=-2*f+3*u,g=f-u,v=1-p,M=g-u+d;for(let x=0;x!==o;x++){const w=a[_+x+o],S=a[_+x+l]*h,A=a[m+x+o],y=a[m+x]*h;r[x]=v*w+M*S+p*A+g*y}return r}}const TS=new Jt;class AS extends ip{interpolate_(e,t,n,i){const r=super.interpolate_(e,t,n,i);return TS.fromArray(r).normalize().toArray(r),r}}const Wn={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6},ar={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},sp={9728:Ht,9729:Gt,9984:Tu,9985:Ua,9986:Rr,9987:Ti},rp={33071:Fn,33648:Da,10497:bn},yh={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},Sh={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},Ki={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},ES={CUBICSPLINE:void 0,LINEAR:Lr,STEP:Ir},wh={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function CS(s){return s.DefaultMaterial===void 0&&(s.DefaultMaterial=new th({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:ki})),s.DefaultMaterial}function ds(s,e,t){for(const n in t.extensions)s[n]===void 0&&(e.userData.gltfExtensions=e.userData.gltfExtensions||{},e.userData.gltfExtensions[n]=t.extensions[n])}function vi(s,e){e.extras!==void 0&&(typeof e.extras=="object"?Object.assign(s.userData,e.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+e.extras))}function RS(s,e,t){let n=!1,i=!1,r=!1;for(let c=0,h=e.length;c<h;c++){const d=e[c];if(d.POSITION!==void 0&&(n=!0),d.NORMAL!==void 0&&(i=!0),d.COLOR_0!==void 0&&(r=!0),n&&i&&r)break}if(!n&&!i&&!r)return Promise.resolve(s);const a=[],o=[],l=[];for(let c=0,h=e.length;c<h;c++){const d=e[c];if(n){const u=d.POSITION!==void 0?t.getDependency("accessor",d.POSITION):s.attributes.position;a.push(u)}if(i){const u=d.NORMAL!==void 0?t.getDependency("accessor",d.NORMAL):s.attributes.normal;o.push(u)}if(r){const u=d.COLOR_0!==void 0?t.getDependency("accessor",d.COLOR_0):s.attributes.color;l.push(u)}}return Promise.all([Promise.all(a),Promise.all(o),Promise.all(l)]).then(function(c){const h=c[0],d=c[1],u=c[2];return n&&(s.morphAttributes.position=h),i&&(s.morphAttributes.normal=d),r&&(s.morphAttributes.color=u),s.morphTargetsRelative=!0,s})}function PS(s,e){if(s.updateMorphTargets(),e.weights!==void 0)for(let t=0,n=e.weights.length;t<n;t++)s.morphTargetInfluences[t]=e.weights[t];if(e.extras&&Array.isArray(e.extras.targetNames)){const t=e.extras.targetNames;if(s.morphTargetInfluences.length===t.length){s.morphTargetDictionary={};for(let n=0,i=t.length;n<i;n++)s.morphTargetDictionary[t[n]]=n}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function IS(s){let e;const t=s.extensions&&s.extensions[rt.KHR_DRACO_MESH_COMPRESSION];if(t?e="draco:"+t.bufferView+":"+t.indices+":"+bh(t.attributes):e=s.indices+":"+bh(s.attributes)+":"+s.mode,s.targets!==void 0)for(let n=0,i=s.targets.length;n<i;n++)e+=":"+bh(s.targets[n]);return e}function bh(s){let e="";const t=Object.keys(s).sort();for(let n=0,i=t.length;n<i;n++)e+=t[n]+":"+s[t[n]]+";";return e}function Th(s){switch(s){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function LS(s){return s.search(/\.jpe?g($|\?)/i)>0||s.search(/^data\:image\/jpeg/)===0?"image/jpeg":s.search(/\.webp($|\?)/i)>0||s.search(/^data\:image\/webp/)===0?"image/webp":s.search(/\.ktx2($|\?)/i)>0||s.search(/^data\:image\/ktx2/)===0?"image/ktx2":"image/png"}const DS=new De;class US{constructor(e={},t={}){this.json=e,this.extensions={},this.plugins={},this.options=t,this.cache=new iS,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,i=-1,r=!1,a=-1;if(typeof navigator<"u"&&typeof navigator.userAgent<"u"){const o=navigator.userAgent;n=/^((?!chrome|android).)*safari/i.test(o)===!0;const l=o.match(/Version\/(\d+)/);i=n&&l?parseInt(l[1],10):-1,r=o.indexOf("Firefox")>-1,a=r?o.match(/Firefox\/([0-9]+)\./)[1]:-1}typeof createImageBitmap>"u"||n&&i<17||r&&a<98?this.textureLoader=new id(this.options.manager):this.textureLoader=new cd(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new nd(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials"&&this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,t){const n=this,i=this.json,r=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(a){return a._markDefs&&a._markDefs()}),Promise.all(this._invokeAll(function(a){return a.beforeRoot&&a.beforeRoot()})).then(function(){return Promise.all([n.getDependencies("scene"),n.getDependencies("animation"),n.getDependencies("camera")])}).then(function(a){const o={scene:a[0][i.scene||0],scenes:a[0],animations:a[1],cameras:a[2],asset:i.asset,parser:n,userData:{}};return ds(r,o,i),vi(o,i),Promise.all(n._invokeAll(function(l){return l.afterRoot&&l.afterRoot(o)})).then(function(){for(const l of o.scenes)l.updateMatrixWorld();e(o)})}).catch(t)}_markDefs(){const e=this.json.nodes||[],t=this.json.skins||[],n=this.json.meshes||[];for(let i=0,r=t.length;i<r;i++){const a=t[i].joints;for(let o=0,l=a.length;o<l;o++)e[a[o]].isBone=!0}for(let i=0,r=e.length;i<r;i++){const a=e[i];a.mesh!==void 0&&(this._addNodeRef(this.meshCache,a.mesh),a.skin!==void 0&&(n[a.mesh].isSkinnedMesh=!0)),a.camera!==void 0&&this._addNodeRef(this.cameraCache,a.camera)}}_addNodeRef(e,t){t!==void 0&&(e.refs[t]===void 0&&(e.refs[t]=e.uses[t]=0),e.refs[t]++)}_getNodeRef(e,t,n){if(e.refs[t]<=1)return n;const i=n.clone(),r=(a,o)=>{const l=this.associations.get(a);l!=null&&this.associations.set(o,l);for(const[c,h]of a.children.entries())r(h,o.children[c])};return r(n,i),i.name+="_instance_"+e.uses[t]++,i}_invokeOne(e){const t=Object.values(this.plugins);t.push(this);for(let n=0;n<t.length;n++){const i=e(t[n]);if(i)return i}return null}_invokeAll(e){const t=Object.values(this.plugins);t.unshift(this);const n=[];for(let i=0;i<t.length;i++){const r=e(t[i]);r&&n.push(r)}return n}getDependency(e,t){const n=e+":"+t;let i=this.cache.get(n);if(!i){switch(e){case"scene":i=this.loadScene(t);break;case"node":i=this._invokeOne(function(r){return r.loadNode&&r.loadNode(t)});break;case"mesh":i=this._invokeOne(function(r){return r.loadMesh&&r.loadMesh(t)});break;case"accessor":i=this.loadAccessor(t);break;case"bufferView":i=this._invokeOne(function(r){return r.loadBufferView&&r.loadBufferView(t)});break;case"buffer":i=this.loadBuffer(t);break;case"material":i=this._invokeOne(function(r){return r.loadMaterial&&r.loadMaterial(t)});break;case"texture":i=this._invokeOne(function(r){return r.loadTexture&&r.loadTexture(t)});break;case"skin":i=this.loadSkin(t);break;case"animation":i=this._invokeOne(function(r){return r.loadAnimation&&r.loadAnimation(t)});break;case"camera":i=this.loadCamera(t);break;default:if(i=this._invokeOne(function(r){return r!=this&&r.getDependency&&r.getDependency(e,t)}),!i)throw new Error("Unknown type: "+e);break}this.cache.add(n,i)}return i}getDependencies(e){let t=this.cache.get(e);if(!t){const n=this,i=this.json[e+(e==="mesh"?"es":"s")]||[];t=Promise.all(i.map(function(r,a){return n.getDependency(e,a)})),this.cache.add(e,t)}return t}loadBuffer(e){const t=this.json.buffers[e],n=this.fileLoader;if(t.type&&t.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+t.type+" buffer type is not supported.");if(t.uri===void 0&&e===0)return Promise.resolve(this.extensions[rt.KHR_BINARY_GLTF].body);const i=this.options;return new Promise(function(r,a){n.load(fa.resolveURL(t.uri,i.path),r,void 0,function(){a(new Error('THREE.GLTFLoader: Failed to load buffer "'+t.uri+'".'))})})}loadBufferView(e){const t=this.json.bufferViews[e];return this.getDependency("buffer",t.buffer).then(function(n){const i=t.byteLength||0,r=t.byteOffset||0;return n.slice(r,r+i)})}loadAccessor(e){const t=this,n=this.json,i=this.json.accessors[e];if(i.bufferView===void 0&&i.sparse===void 0){const a=yh[i.type],o=ar[i.componentType],l=i.normalized===!0,c=new o(i.count*a);return Promise.resolve(new Ot(c,a,l))}const r=[];return i.bufferView!==void 0?r.push(this.getDependency("bufferView",i.bufferView)):r.push(null),i.sparse!==void 0&&(r.push(this.getDependency("bufferView",i.sparse.indices.bufferView)),r.push(this.getDependency("bufferView",i.sparse.values.bufferView))),Promise.all(r).then(function(a){const o=a[0],l=yh[i.type],c=ar[i.componentType],h=c.BYTES_PER_ELEMENT,d=h*l,u=i.byteOffset||0,f=i.bufferView!==void 0?n.bufferViews[i.bufferView].byteStride:void 0,m=i.normalized===!0;let _,p;if(f&&f!==d){const g=Math.floor(u/f),v="InterleavedBuffer:"+i.bufferView+":"+i.componentType+":"+g+":"+i.count;let M=t.cache.get(v);M||(_=new c(o,g*f,i.count*f/h),M=new sf(_,f/h),t.cache.add(v,M)),p=new Gr(M,l,u%f/h,m)}else o===null?_=new c(i.count*l):_=new c(o,u,i.count*l),p=new Ot(_,l,m);if(i.sparse!==void 0){const g=yh.SCALAR,v=ar[i.sparse.indices.componentType],M=i.sparse.indices.byteOffset||0,x=i.sparse.values.byteOffset||0,w=new v(a[1],M,i.sparse.count*g),S=new c(a[2],x,i.sparse.count*l);o!==null&&(p=new Ot(p.array.slice(),p.itemSize,p.normalized)),p.normalized=!1;for(let A=0,y=w.length;A<y;A++){const T=w[A];if(p.setX(T,S[A*l]),l>=2&&p.setY(T,S[A*l+1]),l>=3&&p.setZ(T,S[A*l+2]),l>=4&&p.setW(T,S[A*l+3]),l>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}p.normalized=m}return p})}loadTexture(e){const t=this.json,n=this.options,r=t.textures[e].source,a=t.images[r];let o=this.textureLoader;if(a.uri){const l=n.manager.getHandler(a.uri);l!==null&&(o=l)}return this.loadTextureImage(e,r,o)}loadTextureImage(e,t,n){const i=this,r=this.json,a=r.textures[e],o=r.images[t],l=(o.uri||o.bufferView)+":"+a.sampler;if(this.textureCache[l])return this.textureCache[l];const c=this.loadImageSource(t,n).then(function(h){h.flipY=!1,h.name=a.name||o.name||"",h.name===""&&typeof o.uri=="string"&&o.uri.startsWith("data:image/")===!1&&(h.name=o.uri);const u=(r.samplers||{})[a.sampler]||{};return h.magFilter=sp[u.magFilter]||Gt,h.minFilter=sp[u.minFilter]||Ti,h.wrapS=rp[u.wrapS]||bn,h.wrapT=rp[u.wrapT]||bn,h.generateMipmaps=!h.isCompressedTexture&&h.minFilter!==Ht&&h.minFilter!==Gt,i.associations.set(h,{textures:e}),h}).catch(function(){return null});return this.textureCache[l]=c,c}loadImageSource(e,t){const n=this,i=this.json,r=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then(d=>d.clone());const a=i.images[e],o=self.URL||self.webkitURL;let l=a.uri||"",c=!1;if(a.bufferView!==void 0)l=n.getDependency("bufferView",a.bufferView).then(function(d){c=!0;const u=new Blob([d],{type:a.mimeType});return l=o.createObjectURL(u),l});else if(a.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+e+" is missing URI and bufferView");const h=Promise.resolve(l).then(function(d){return new Promise(function(u,f){let m=u;t.isImageBitmapLoader===!0&&(m=function(_){const p=new Ft(_);p.needsUpdate=!0,u(p)}),t.load(fa.resolveURL(d,r.path),m,void 0,f)})}).then(function(d){return c===!0&&o.revokeObjectURL(l),vi(d,a),d.userData.mimeType=a.mimeType||LS(a.uri),d}).catch(function(d){throw console.error("THREE.GLTFLoader: Couldn't load texture",l),d});return this.sourceCache[e]=h,h}assignTexture(e,t,n,i){const r=this;return this.getDependency("texture",n.index).then(function(a){if(!a)return null;if(n.texCoord!==void 0&&n.texCoord>0&&(a=a.clone(),a.channel=n.texCoord),r.extensions[rt.KHR_TEXTURE_TRANSFORM]){const o=n.extensions!==void 0?n.extensions[rt.KHR_TEXTURE_TRANSFORM]:void 0;if(o){const l=r.associations.get(a);a=r.extensions[rt.KHR_TEXTURE_TRANSFORM].extendTexture(a,o),r.associations.set(a,l)}}return i!==void 0&&(a.colorSpace=i),e[t]=a,a})}assignFinalMaterial(e){const t=e.geometry;let n=e.material;const i=t.attributes.tangent===void 0,r=t.attributes.color!==void 0,a=t.attributes.normal===void 0;if(e.isPoints){const o="PointsMaterial:"+n.uuid;let l=this.cache.get(o);l||(l=new Tf,Ln.prototype.copy.call(l,n),l.color.copy(n.color),l.map=n.map,l.sizeAttenuation=!1,this.cache.add(o,l)),n=l}else if(e.isLine){const o="LineBasicMaterial:"+n.uuid;let l=this.cache.get(o);l||(l=new Mf,Ln.prototype.copy.call(l,n),l.color.copy(n.color),l.map=n.map,this.cache.add(o,l)),n=l}if(i||r||a){let o="ClonedMaterial:"+n.uuid+":";i&&(o+="derivative-tangents:"),r&&(o+="vertex-colors:"),a&&(o+="flat-shading:");let l=this.cache.get(o);l||(l=n.clone(),r&&(l.vertexColors=!0),a&&(l.flatShading=!0),i&&(l.normalScale&&(l.normalScale.y*=-1),l.clearcoatNormalScale&&(l.clearcoatNormalScale.y*=-1)),this.cache.add(o,l),this.associations.set(l,this.associations.get(n))),n=l}e.material=n}getMaterialType(){return th}loadMaterial(e){const t=this,n=this.json,i=this.extensions,r=n.materials[e];let a;const o={},l=r.extensions||{},c=[];if(l[rt.KHR_MATERIALS_UNLIT]){const d=i[rt.KHR_MATERIALS_UNLIT];a=d.getMaterialType(),c.push(d.extendParams(o,r,t))}else{const d=r.pbrMetallicRoughness||{};if(o.color=new ge(1,1,1),o.opacity=1,Array.isArray(d.baseColorFactor)){const u=d.baseColorFactor;o.color.setRGB(u[0],u[1],u[2],Rn),o.opacity=u[3]}d.baseColorTexture!==void 0&&c.push(t.assignTexture(o,"map",d.baseColorTexture,Wt)),o.metalness=d.metallicFactor!==void 0?d.metallicFactor:1,o.roughness=d.roughnessFactor!==void 0?d.roughnessFactor:1,d.metallicRoughnessTexture!==void 0&&(c.push(t.assignTexture(o,"metalnessMap",d.metallicRoughnessTexture)),c.push(t.assignTexture(o,"roughnessMap",d.metallicRoughnessTexture))),a=this._invokeOne(function(u){return u.getMaterialType&&u.getMaterialType(e)}),c.push(Promise.all(this._invokeAll(function(u){return u.extendMaterialParams&&u.extendMaterialParams(e,o)})))}r.doubleSided===!0&&(o.side=rn);const h=r.alphaMode||wh.OPAQUE;if(h===wh.BLEND?(o.transparent=!0,o.depthWrite=!1):(o.transparent=!1,h===wh.MASK&&(o.alphaTest=r.alphaCutoff!==void 0?r.alphaCutoff:.5)),r.normalTexture!==void 0&&a!==Dt&&(c.push(t.assignTexture(o,"normalMap",r.normalTexture)),o.normalScale=new pe(1,1),r.normalTexture.scale!==void 0)){const d=r.normalTexture.scale;o.normalScale.set(d,d)}if(r.occlusionTexture!==void 0&&a!==Dt&&(c.push(t.assignTexture(o,"aoMap",r.occlusionTexture)),r.occlusionTexture.strength!==void 0&&(o.aoMapIntensity=r.occlusionTexture.strength)),r.emissiveFactor!==void 0&&a!==Dt){const d=r.emissiveFactor;o.emissive=new ge().setRGB(d[0],d[1],d[2],Rn)}return r.emissiveTexture!==void 0&&a!==Dt&&c.push(t.assignTexture(o,"emissiveMap",r.emissiveTexture,Wt)),Promise.all(c).then(function(){const d=new a(o);return r.name&&(d.name=r.name),vi(d,r),t.associations.set(d,{materials:e}),r.extensions&&ds(i,d,r),d})}createUniqueName(e){const t=bt.sanitizeNodeName(e||"");return t in this.nodeNamesUsed?t+"_"+ ++this.nodeNamesUsed[t]:(this.nodeNamesUsed[t]=0,t)}loadGeometries(e){const t=this,n=this.extensions,i=this.primitiveCache;function r(o){return n[rt.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(o,t).then(function(l){return ap(l,o,t)})}const a=[];for(let o=0,l=e.length;o<l;o++){const c=e[o],h=IS(c),d=i[h];if(d)a.push(d.promise);else{let u;c.extensions&&c.extensions[rt.KHR_DRACO_MESH_COMPRESSION]?u=r(c):u=ap(new At,c,t),c.mode===Wn.TRIANGLE_STRIP?u=u.then(f=>jd(f,zu)):c.mode===Wn.TRIANGLE_FAN&&(u=u.then(f=>jd(f,oc))),i[h]={primitive:c,promise:u},a.push(u)}}return Promise.all(a)}loadMesh(e){const t=this,n=this.json,i=this.extensions,r=n.meshes[e],a=r.primitives,o=[];for(let l=0,c=a.length;l<c;l++){const h=a[l].material===void 0?CS(this.cache):this.getDependency("material",a[l].material);o.push(h)}return o.push(t.loadGeometries(a)),Promise.all(o).then(async function(l){const c=l.slice(0,l.length-1),h=l[l.length-1],d=[];for(let f=0,m=h.length;f<m;f++){const _=h[f],p=a[f];let g;const v=c[f];if(p.mode===Wn.TRIANGLES||p.mode===Wn.TRIANGLE_STRIP||p.mode===Wn.TRIANGLE_FAN||p.mode===void 0){const M=r.isSkinnedMesh===!0,x=_.hasAttribute("skinIndex")&&_.hasAttribute("skinWeight");M&&x===!1&&console.warn("THREE.GLTFLoader: Missing skinIndex or skinWeight attributes. Skinning disabled."),g=M&&x?new v0(_,v):new $e(_,v),g.isSkinnedMesh===!0&&g.normalizeSkinWeights()}else if(p.mode===Wn.LINES)g=new S0(_,v);else if(p.mode===Wn.LINE_STRIP)g=new kc(_,v);else if(p.mode===Wn.LINE_LOOP)g=new w0(_,v);else if(p.mode===Wn.POINTS)g=new Ef(_,v);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+p.mode);Object.keys(g.geometry.morphAttributes).length>0&&PS(g,r),g.name=t.createUniqueName(r.name||"mesh_"+e),vi(g,r),p.extensions&&ds(i,g,p),t.assignFinalMaterial(g),d.push(g)}for(let f=0,m=d.length;f<m;f++)t.associations.set(d[f],{meshes:e,primitives:f});if(d.length===1)return r.extensions&&ds(i,d[0],r),d[0];const u=new Xt;r.extensions&&ds(i,u,r),t.associations.set(u,{meshes:e});for(let f=0,m=d.length;f<m;f++)u.add(d[f]);return u})}loadCamera(e){let t;const n=this.json.cameras[e],i=n[n.type];if(!i){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}return n.type==="perspective"?t=new yn(Wa.radToDeg(i.yfov),i.aspectRatio||1,i.znear||1,i.zfar||2e6):n.type==="orthographic"&&(t=new ua(-i.xmag,i.xmag,i.ymag,-i.ymag,i.znear,i.zfar)),n.name&&(t.name=this.createUniqueName(n.name)),vi(t,n),Promise.resolve(t)}loadSkin(e){const t=this.json.skins[e],n=[];for(let i=0,r=t.joints.length;i<r;i++)n.push(this._loadNodeShallow(t.joints[i]));return t.inverseBindMatrices!==void 0?n.push(this.getDependency("accessor",t.inverseBindMatrices)):n.push(null),Promise.all(n).then(function(i){const r=i.pop(),a=i,o=[],l=[];for(let c=0,h=a.length;c<h;c++){const d=a[c];if(d){o.push(d);const u=new De;r!==null&&u.fromArray(r.array,c*16),l.push(u)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',t.joints[c])}return new Fc(o,l)})}loadAnimation(e){const t=this.json,n=this,i=t.animations[e],r=i.name?i.name:"animation_"+e,a=[],o=[],l=[],c=[],h=[];for(let d=0,u=i.channels.length;d<u;d++){const f=i.channels[d],m=i.samplers[f.sampler],_=f.target,p=_.node,g=i.parameters!==void 0?i.parameters[m.input]:m.input,v=i.parameters!==void 0?i.parameters[m.output]:m.output;_.node!==void 0&&(a.push(this.getDependency("node",p)),o.push(this.getDependency("accessor",g)),l.push(this.getDependency("accessor",v)),c.push(m),h.push(_))}return Promise.all([Promise.all(a),Promise.all(o),Promise.all(l),Promise.all(c),Promise.all(h)]).then(function(d){const u=d[0],f=d[1],m=d[2],_=d[3],p=d[4],g=[];for(let M=0,x=u.length;M<x;M++){const w=u[M],S=f[M],A=m[M],y=_[M],T=p[M];if(w===void 0)continue;w.updateMatrix&&w.updateMatrix();const C=n._createAnimationTracks(w,S,A,y,T);if(C)for(let P=0;P<C.length;P++)g.push(C[P])}const v=new gg(r,void 0,g);return vi(v,i),v})}createNodeMesh(e){const t=this.json,n=this,i=t.nodes[e];return i.mesh===void 0?null:n.getDependency("mesh",i.mesh).then(function(r){const a=n._getNodeRef(n.meshCache,i.mesh,r);return i.weights!==void 0&&a.traverse(function(o){if(o.isMesh)for(let l=0,c=i.weights.length;l<c;l++)o.morphTargetInfluences[l]=i.weights[l]}),a})}loadNode(e){const t=this.json,n=this,i=t.nodes[e],r=n._loadNodeShallow(e),a=[],o=i.children||[];for(let c=0,h=o.length;c<h;c++)a.push(n.getDependency("node",o[c]));const l=i.skin===void 0?Promise.resolve(null):n.getDependency("skin",i.skin);return Promise.all([r,Promise.all(a),l]).then(function(c){const h=c[0],d=c[1],u=c[2];u!==null&&h.traverse(function(f){f.isSkinnedMesh&&f.bind(u,DS)});for(let f=0,m=d.length;f<m;f++)h.add(d[f]);if(h.userData.pivot!==void 0&&d.length>0){const f=h.userData.pivot,m=d[0];h.pivot=new L().fromArray(f),h.position.x-=f[0],h.position.y-=f[1],h.position.z-=f[2],m.position.set(0,0,0),delete h.userData.pivot}return h})}_loadNodeShallow(e){const t=this.json,n=this.extensions,i=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];const r=t.nodes[e],a=r.name?i.createUniqueName(r.name):"",o=[],l=i._invokeOne(function(c){return c.createNodeMesh&&c.createNodeMesh(e)});return l&&o.push(l),r.camera!==void 0&&o.push(i.getDependency("camera",r.camera).then(function(c){return i._getNodeRef(i.cameraCache,r.camera,c)})),i._invokeAll(function(c){return c.createNodeAttachment&&c.createNodeAttachment(e)}).forEach(function(c){o.push(c)}),this.nodeCache[e]=Promise.all(o).then(function(c){let h;if(r.isBone===!0?h=new gf:c.length>1?h=new Xt:c.length===1?h=c[0]:h=new Lt,h!==c[0])for(let d=0,u=c.length;d<u;d++)h.add(c[d]);if(r.name&&(h.userData.name=r.name,h.name=a),vi(h,r),r.extensions&&ds(n,h,r),r.matrix!==void 0){const d=new De;d.fromArray(r.matrix),h.applyMatrix4(d)}else r.translation!==void 0&&h.position.fromArray(r.translation),r.rotation!==void 0&&h.quaternion.fromArray(r.rotation),r.scale!==void 0&&h.scale.fromArray(r.scale);if(!i.associations.has(h))i.associations.set(h,{});else if(r.mesh!==void 0&&i.meshCache.refs[r.mesh]>1){const d=i.associations.get(h);i.associations.set(h,{...d})}return i.associations.get(h).nodes=e,h}),this.nodeCache[e]}loadScene(e){const t=this.extensions,n=this.json.scenes[e],i=this,r=new Xt;n.name&&(r.name=i.createUniqueName(n.name)),vi(r,n),n.extensions&&ds(t,r,n);const a=n.nodes||[],o=[];for(let l=0,c=a.length;l<c;l++)o.push(i.getDependency("node",a[l]));return Promise.all(o).then(function(l){for(let h=0,d=l.length;h<d;h++){const u=l[h];u.parent!==null?r.add(tS(u)):r.add(u)}const c=h=>{const d=new Map;for(const[u,f]of i.associations)(u instanceof Ln||u instanceof Ft)&&d.set(u,f);return h.traverse(u=>{const f=i.associations.get(u);f!=null&&d.set(u,f)}),d};return i.associations=c(r),r})}_createAnimationTracks(e,t,n,i,r){const a=[],o=e.name?e.name:e.uuid,l=[];function c(f){f.morphTargetInfluences&&l.push(f.name?f.name:f.uuid)}Ki[r.path]===Ki.weights?(c(e),e.isGroup&&e.children.forEach(c)):l.push(o);let h;switch(Ki[r.path]){case Ki.weights:h=ca;break;case Ki.rotation:h=ha;break;case Ki.translation:case Ki.scale:h=To;break;default:switch(n.itemSize){case 1:h=ca;break;case 2:case 3:default:h=To;break}break}const d=i.interpolation!==void 0?ES[i.interpolation]:Lr,u=this._getArrayFromAccessor(n);for(let f=0,m=l.length;f<m;f++){const _=new h(l[f]+"."+Ki[r.path],t.array,u,d);i.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(_),a.push(_)}return a}_getArrayFromAccessor(e){let t=e.array;if(e.normalized){const n=Th(t.constructor),i=new Float32Array(t.length);for(let r=0,a=t.length;r<a;r++)i[r]=t[r]*n;t=i}return t}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(n){const i=this instanceof ha?AS:ip;return new i(this.times,this.values,this.getValueSize()/3,n)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}}function NS(s,e,t){const n=e.attributes,i=new Li;if(n.POSITION!==void 0){const o=t.json.accessors[n.POSITION],l=o.min,c=o.max;if(l!==void 0&&c!==void 0){if(i.set(new L(l[0],l[1],l[2]),new L(c[0],c[1],c[2])),o.normalized){const h=Th(ar[o.componentType]);i.min.multiplyScalar(h),i.max.multiplyScalar(h)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;const r=e.targets;if(r!==void 0){const o=new L,l=new L;for(let c=0,h=r.length;c<h;c++){const d=r[c];if(d.POSITION!==void 0){const u=t.json.accessors[d.POSITION],f=u.min,m=u.max;if(f!==void 0&&m!==void 0){if(l.setX(Math.max(Math.abs(f[0]),Math.abs(m[0]))),l.setY(Math.max(Math.abs(f[1]),Math.abs(m[1]))),l.setZ(Math.max(Math.abs(f[2]),Math.abs(m[2]))),u.normalized){const _=Th(ar[u.componentType]);l.multiplyScalar(_)}o.max(l)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}i.expandByVector(o)}s.boundingBox=i;const a=new hi;i.getCenter(a.center),a.radius=i.min.distanceTo(i.max)/2,s.boundingSphere=a}function ap(s,e,t){const n=e.attributes,i=[];function r(a,o){return t.getDependency("accessor",a).then(function(l){s.setAttribute(o,l)})}for(const a in n){const o=Sh[a]||a.toLowerCase();o in s.attributes||i.push(r(n[a],o))}if(e.indices!==void 0&&!s.index){const a=t.getDependency("accessor",e.indices).then(function(o){s.setIndex(o)});i.push(a)}return st.workingColorSpace!==Rn&&"COLOR_0"in n&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${st.workingColorSpace}" not supported.`),vi(s,e),NS(s,e,t),Promise.all(i).then(function(){return e.targets!==void 0?RS(s,e.targets,t):s})}var zS=""+new URL("tree_palm-BEEAKdDk.glb",self.location.href).href,FS=""+new URL("tree_palmBend-CQDkKgc9.glb",self.location.href).href,OS=""+new URL("tree_palmTall-BKlEnhoO.glb",self.location.href).href,BS=""+new URL("tree_palmDetailedShort-DaC7NTEp.glb",self.location.href).href,kS=""+new URL("plant_bushLarge-BLvTfwBP.glb",self.location.href).href,VS=""+new URL("tree_oak-DRiJ_qxq.glb",self.location.href).href,HS=""+new URL("tree_default-BVPrFQ50.glb",self.location.href).href,GS=""+new URL("tree_detailed-Bj1KgEOz.glb",self.location.href).href,WS=""+new URL("tree_fat-t81E4Z9b.glb",self.location.href).href,Ah=""+new URL("plant_bush-OKb8oW2E.glb",self.location.href).href,op=""+new URL("tree_pineRoundA-Ci4Gf58C.glb",self.location.href).href,XS=""+new URL("tree_pineTallA_detailed-Dwup5pQY.glb",self.location.href).href,YS=""+new URL("tree_pineDefaultA-o9UUWThz.glb",self.location.href).href,qS=""+new URL("tree_cone_dark-C35861im.glb",self.location.href).href,ZS=""+new URL("tree_plateau-DVzdsNJV.glb",self.location.href).href,$S=""+new URL("tree_thin-DVItm2Xl.glb",self.location.href).href,KS="data:model/gltf-binary;base64,Z2xURgIAAAB0DwAAsAUAAEpTT057ImV4dGVuc2lvbnNVc2VkIjpbIktIUl9tYXRlcmlhbHNfdW5saXQiXSwiYXNzZXQiOnsiZ2VuZXJhdG9yIjoiVW5pR0xURi0xLjI3IiwidmVyc2lvbiI6IjIuMCJ9LCJidWZmZXJzIjpbeyJieXRlTGVuZ3RoIjoyNDcyfV0sImJ1ZmZlclZpZXdzIjpbeyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjAsImJ5dGVMZW5ndGgiOjc5MiwidGFyZ2V0IjozNDk2Mn0seyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjc5MiwiYnl0ZUxlbmd0aCI6NzkyLCJ0YXJnZXQiOjM0OTYyfSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MTU4NCwiYnl0ZUxlbmd0aCI6NTI4LCJ0YXJnZXQiOjM0OTYyfSx7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MjExMiwiYnl0ZUxlbmd0aCI6MzYwLCJ0YXJnZXQiOjM0OTYzfV0sImFjY2Vzc29ycyI6W3siYnVmZmVyVmlldyI6MCwiYnl0ZU9mZnNldCI6MCwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6NjYsIm1heCI6WzAuMTI1NjQ0NywwLjI5NTUzNjk2NSwwLjIwNjc5NjFdLCJtaW4iOlstMC4yMzg3ODc1NDcsMCwtMC4yMDY3OTYxXSwibm9ybWFsaXplZCI6ZmFsc2V9LHsiYnVmZmVyVmlldyI6MSwiYnl0ZU9mZnNldCI6MCwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6NjYsIm5vcm1hbGl6ZWQiOmZhbHNlfSx7ImJ1ZmZlclZpZXciOjIsImJ5dGVPZmZzZXQiOjAsInR5cGUiOiJWRUMyIiwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjY2LCJub3JtYWxpemVkIjpmYWxzZX0seyJidWZmZXJWaWV3IjozLCJieXRlT2Zmc2V0IjowLCJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyNSwiY291bnQiOjkwLCJub3JtYWxpemVkIjpmYWxzZX1dLCJtYXRlcmlhbHMiOlt7Im5hbWUiOiJncmFzcyIsInBick1ldGFsbGljUm91Z2huZXNzIjp7ImJhc2VDb2xvckZhY3RvciI6WzAuMTcyNTQ5MDI0LDAuODQ3MDU4ODMzLDAuNzIxNTY4NjQ0LDFdLCJtZXRhbGxpY0ZhY3RvciI6MSwicm91Z2huZXNzRmFjdG9yIjoxfSwiZG91YmxlU2lkZWQiOmZhbHNlLCJhbHBoYU1vZGUiOiJPUEFRVUUifV0sIm1lc2hlcyI6W3sibmFtZSI6Ik1lc2ggcGxhbnRfYnVzaFRyaWFuZ2xlIiwicHJpbWl0aXZlcyI6W3sibW9kZSI6NCwiaW5kaWNlcyI6MywiYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6MCwiTk9STUFMIjoxLCJURVhDT09SRF8wIjoyfSwibWF0ZXJpYWwiOjB9XX1dLCJub2RlcyI6W3siY2hpbGRyZW4iOlsxXSwibmFtZSI6InRtcFBhcmVudCIsInRyYW5zbGF0aW9uIjpbMCwwLDBdLCJyb3RhdGlvbiI6WzAsMCwwLDFdLCJzY2FsZSI6WzEsMSwxXX0seyJuYW1lIjoicGxhbnRfYnVzaFRyaWFuZ2xlIiwidHJhbnNsYXRpb24iOlswLC0wLjA1LDBdLCJyb3RhdGlvbiI6WzAsMCwwLDFdLCJzY2FsZSI6WzEsMSwxXSwibWVzaCI6MH1dLCJzY2VuZXMiOlt7Im5vZGVzIjpbMV19XSwic2NlbmUiOjB9qAkAAEJJTgBq6TW9DK7FPUHAzD0qzN49DK7FPdfXPDz/9HA8S7ATPj5CHT4BqQA+S7ATPtdXtz3/9HA8S7ATPj5CHT4qzN49DK7FPdfXPDxq6TW9DK7FPUHAzD0BqQA+S7ATPtdXtz3DRMS7AAAAAOJnBD393f08AAAAACbTMzxq6TW9DK7FPUHAzD0qzN49DK7FPdfXPDxq6TW9DK7FPUHAzD393f08AAAAACbTMzzDRMS7AAAAAOJnBD0qzN49DK7FPdfXPDy5hPQ9rZo4PlvCUz7/9HA8S7ATPj5CHT4BqQA+S7ATPtdXtz0BqQA+S7ATPtdXtz3/9HA8S7ATPj5CHT65hPQ9rZo4PlvCUz5114O9XggiPkYltT1114O9XggiPkYltb3NzMy8AAAAADLmrjzNzMy8AAAAADLmrrzNzMy8AAAAADLmrjx114O9XggiPkYltb1114O9XggiPkYltT3NzMy8AAAAADLmrrxRuA++zhxyPqUsgz25hHS+n1CXPueMCKpRuA++zhxyPqUsg71RuA++zhxyPqUsg725hHS+n1CXPueMCKpRuA++zhxyPqUsgz1114O9XggiPkYltT1RuA++zhxyPqUsgz1114O9XggiPkYltb1RuA++zhxyPqUsg71114O9XggiPkYltb1RuA++zhxyPqUsgz1114O9XggiPkYltT1RuA++zhxyPqUsg73/9HA8agE4Pj5CHb65hPQ9qv9lPlvCU74BqQA+agE4PtdXt70BqQA+agE4PtdXt725hPQ9qv9lPlvCU77/9HA8agE4Pj5CHb5q6TW9KUr2PUHAzL3/9HA8agE4Pj5CHb4qzN49KUr2PdfXPLwBqQA+agE4PtdXt70qzN49KUr2PdfXPLz/9HA8agE4Pj5CHb5q6TW9KUr2PUHAzL0BqQA+agE4PtdXt7393f08AAAAACbTM7zDRMS7AAAAAOJnBL0qzN49KUr2PdfXPLxq6TW9KUr2PUHAzL0qzN49KUr2PdfXPLzDRMS7AAAAAOJnBL393f08AAAAACbTM7xq6TW9KUr2PUHAzL34IIi+aM5YPzDI6774IIi+aM5YPzDI6774IIi+aM5YPzDI6774IIi+aM5YPzDI6774IIg+aM5YvzDI6z74IIg+aM5YvzDI6z74IIg+aM5YvzDI6z74IIg+aM5YvzDI6z4UCe2+imTBPltHTb8UCe2+imTBPltHTb8UCe2+imTBPltHTb8UCe2+imTBPltHTb8UCe0+imTBvltHTT8UCe0+imTBvltHTT8UCe0+imTBvltHTT8UCe0+imTBvltHTT/qEjC+2WJwPwZ8mL7qEjC+2WJwPwZ8mL7qEjC+2WJwPwZ8mL7qEjA+2WJwvwZ8mD7qEjA+2WJwvwZ8mD7qEjA+2WJwvwZ8mD6GbHg/YUZ3PgAAAICGbHg/YUZ3PgAAAICGbHg/YUZ3PgAAAICGbHg/YUZ3PgAAAICGbHi/YUZ3vgAAAICGbHi/YUZ3vgAAAICGbHi/YUZ3vgAAAICGbHi/YUZ3vgAAAICqxQM/QHtbPwAAAICqxQM/QHtbPwAAAICqxQM/QHtbPwAAAICqxQO/QHtbvwAAAICqxQO/QHtbvwAAAICqxQO/QHtbvwAAAIB4nTc/wmIyPwAAAIB4nTc/wmIyPwAAAIB4nTc/wmIyPwAAAIB4nTc/wmIyPwAAAIB4nTe/wmIyvwAAAIB4nTe/wmIyvwAAAIB4nTe/wmIyvwAAAIB4nTe/wmIyvwAAAIArilS+kuZoP5UQuD4rilS+kuZoP5UQuD4rilS+kuZoP5UQuD4rilQ+kuZov5UQuL4rilQ+kuZov5UQuL4rilQ+kuZov5UQuL7Uu52+LqJJP/aZCD/Uu52+LqJJP/aZCD/Uu52+LqJJP/aZCD/Uu52+LqJJP/aZCD/Uu50+LqJJv/aZCL/Uu50+LqJJv/aZCL/Uu50+LqJJv/aZCL/Uu50+LqJJv/aZCL9nSvO+wVGfPiWyUj9nSvO+wVGfPiWyUj9nSvO+wVGfPiWyUj9nSvO+wVGfPiWyUj9nSvM+wVGfviWyUr9nSvM+wVGfviWyUr9nSvM+wVGfviWyUr9nSvM+wVGfviWyUr+83V5AHLNKwLzdXsAcs0rAxWIhQPNe1sDFYiHA817WwMViIUDzXtbAvN1ewByzSsC83V5AHLNKwMViIcDzXtbAXS5XP5DTID9dLle/kNMgP7zdXkDYdV7AvN1ewNh1XsC83V5A2HVewF0uV7+Q0yA/XS5XP5DTID+83V7A2HVewABQqSzISyTBxWIhQOmFxMDFYiHA6YXEwMViIcDphcTAxWIhQOmFxMAAUKksyEskwbzdXsBSCbXAvN1eQFIJtcBdLle/oSdDP10uVz+hJ0M/XS5Xv6EnQz+83V5AUgm1wLzdXsBSCbXAXS5XP6EnQz/FYiHAPXYIwTn+pywuyVDBxWIhQD12CMHFYiFAPXYIwTn+pywuyVDBxWIhwD12CMG83V7Al3+nwMViIcBQbhjBvN1eQJd/p8DFYiFAUG4YwbzdXkCXf6fAxWIhwFBuGMG83V7Al3+nwMViIUBQbhjBxWIhwJHX3sAA8K4s8JMzwcViIUCR197AxWIhQJHX3sAA8K4s8JMzwcViIcCR197AvN1ewNJ1esDFYiHAhMH2wLzdXkDSdXrAxWIhQITB9sC83V5A0nV6wMViIcCEwfbAvN1ewNJ1esDFYiFAhMH2wF0uVz9GmDE/XS5Xv0aYMT+83V5A4ziJwLzdXsDjOInAvN1eQOM4icBdLle/RpgxP10uVz9GmDE/vN1ewOM4icACAAAAAQAAAAAAAAABAAAAAgAAAAMAAAAGAAAABQAAAAQAAAAHAAAABAAAAAUAAAAKAAAACQAAAAgAAAAJAAAACgAAAAsAAAAOAAAADQAAAAwAAAAPAAAADAAAAA0AAAASAAAAEQAAABAAAAAVAAAAFAAAABMAAAAYAAAAFwAAABYAAAAXAAAAGAAAABkAAAAcAAAAGwAAABoAAAAdAAAAGgAAABsAAAAgAAAAHwAAAB4AAAAjAAAAIgAAACEAAAAmAAAAJQAAACQAAAAlAAAAJgAAACcAAAAqAAAAKQAAACgAAAArAAAAKAAAACkAAAAuAAAALQAAACwAAAAxAAAAMAAAAC8AAAA0AAAAMwAAADIAAAAzAAAANAAAADUAAAA4AAAANwAAADYAAAA5AAAANgAAADcAAAA8AAAAOwAAADoAAAA7AAAAPAAAAD0AAABAAAAAPwAAAD4AAABBAAAAPgAAAD8AAAA=",JS=""+new URL("tree_default_fall-C-WMBuBk.glb",self.location.href).href,jS=""+new URL("tree_simple_fall-EWa2Y1F6.glb",self.location.href).href,QS=""+new URL("tree_tall-BEMahoC2.glb",self.location.href).href;const e1={tropical:[{url:zS,height:9,weight:3},{url:FS,height:8.5,weight:2},{url:OS,height:11,weight:2},{url:BS,height:6.5,weight:2},{url:kS,height:2.4,weight:2}],temperate:[{url:VS,height:8,weight:3},{url:HS,height:7,weight:3},{url:GS,height:8.5,weight:2},{url:WS,height:6,weight:2},{url:Ah,height:2.2,weight:2}],boreal:[{url:op,height:9,weight:3},{url:XS,height:12,weight:3},{url:YS,height:10,weight:2},{url:qS,height:8,weight:2},{url:Ah,height:2,weight:1}],savanna:[{url:ZS,height:7.5,weight:4},{url:$S,height:8,weight:2},{url:KS,height:2.3,weight:3}],eastasian:[{url:JS,height:6.5,weight:3,tint:"#ffb7cf"},{url:jS,height:6,weight:2,tint:"#d9442e"},{url:QS,height:8,weight:2},{url:op,height:7.5,weight:2},{url:Ah,height:2,weight:2}]},lp=new Map;function t1(s){const e=lp.get(s);if(e)return e;const t=new nS().loadAsync(s).then(n=>{const i=[];if(n.scene.updateMatrixWorld(!0),n.scene.traverse(l=>{const c=l;if(!c.isMesh)return;const h=c.geometry.clone().applyMatrix4(c.matrixWorld),d=new At;d.setAttribute("position",h.getAttribute("position")),h.getAttribute("normal")||h.computeVertexNormals(),d.setAttribute("normal",h.getAttribute("normal")),h.index&&d.setIndex(h.index);const u=new ge(c.material.color??"#6f9d63"),f=d.getAttribute("position").count,m=new Float32Array(f*3);for(let _=0;_<f;_+=1)m[_*3]=u.r,m[_*3+1]=u.g,m[_*3+2]=u.b;d.setAttribute("color",new Ot(m,3)),i.push(d.index?d.toNonIndexed():d),h.dispose()}),!i.length)return null;const r=Mh(i);for(const l of i)l.dispose();if(!r)return null;r.computeBoundingBox();const a=r.boundingBox,o=Math.max(.001,a.max.y-a.min.y);return r.translate(-(a.min.x+a.max.x)/2,-a.min.y,-(a.min.z+a.max.z)/2),r.scale(1/o,1/o,1/o),r}).catch(n=>(console.warn("[city] flora model unavailable",s,n),null));return lp.set(s,t),t}async function n1(s){const e=e1[s],t=await Promise.all(e.map(n=>t1(n.url)));return e.flatMap((n,i)=>t[i]?[{species:n,geometry:t[i]}]:[])}function Eh(s){const e=Math.min(1,Math.max(0,s));return e*e*e*(e*(e*6-15)+10)}const i1=52,Ch=[1.4,1.2,1,.85];function s1(s,e,t,n={}){if(n.cut!=="short")return Rh(s,e,t,n,Math.PI*2);let i=Rh(s,e,t,n,Ch[0]);for(let r=1;r<Ch.length&&i.durationSec>i1;r+=1)i=Rh(s,e,t,n,Ch[r]);return i}function Rh(s,e,t,n,i){const{left:r,right:a,north:o,south:l}=s.urbanBounds,c=(r+a)/2,h=(o+l)/2,d=Math.max(a-r,l-o),u=(k,K)=>Math.max(0,s.terrain.height(k,K));let f={x:c,z:h,height:30,ground:u(c,h)};for(const k of t.values())k.height>f.height&&(f=k);const m=[],_=(k,K,Y)=>m.push({pos:k,look:K,card:Y}),p=s.core??{x:c,z:h},g=[...s.districts].map(k=>({layout:k,data:e.districts.find(K=>K.id===k.id)})).filter(k=>k.data&&k.layout.slots.size>0).sort((k,K)=>K.data.tokensTotal-k.data.tokensTotal),v=k=>{const K=[...k.layout.slots.values()];return{x:K.reduce((Y,ie)=>Y+ie.x,0)/K.length,z:K.reduce((Y,ie)=>Y+ie.z,0)/K.length}},M=g.slice(0,4).map(k=>{const K=v(k);return{district:k,c:K,angle:Math.atan2(K.z-p.z,K.x-p.x),distance:Math.hypot(K.x-p.x,K.z-p.z)}}).sort((k,K)=>k.angle-K.angle),x=M.map(k=>k.district),w=Math.atan2(f.z-p.z,f.x-p.x),S=n.cut==="short"&&f.height>30,A=S?i:Math.PI*2,y=S?.4:1,T=S?w-.9:M.length?M[0].angle-.6:0,C=k=>{let K=k;for(;K<T;)K+=Math.PI*2;for(;K>=T+Math.PI*2;)K-=Math.PI*2;return K},P=M.map(k=>C(k.angle)),D=(k,K)=>Math.abs(Math.atan2(Math.sin(k-K),Math.cos(k-K))),U=Math.max(140,...M.map(k=>k.distance+60)),R=[];f.height>30&&R.push({angle:Math.atan2(f.z-p.z,f.x-p.x),radius:Math.hypot(f.x-p.x,f.z-p.z)+90,height:Math.max(40,f.height*.85),look:{x:f.x,y:f.ground+f.height*.6,z:f.z}});const B=[...s.bridges??[]].sort((k,K)=>K.length-k.length)[0];if(B){const k={x:(B.from.x+B.to.x)/2,z:(B.from.z+B.to.z)/2};R.push({angle:Math.atan2(k.z-p.z,k.x-p.x),radius:Math.hypot(k.x-p.x,k.z-p.z)+70,height:45,look:{x:k.x,y:6,z:k.z}})}const V=k=>{let K=0,Y=0,ie={x:p.x,z:p.z},xe=0;M.forEach(X=>{const J=Math.exp(-((D(k,X.angle)/.38)**2));K+=J,Y+=J*(X.distance+60),J>xe&&(xe=J,ie=X.c)});const O=Math.min(1,K),z={radius:U*(1-O)+(K>0?Y/K:U)*O,height:120-58*O,look:{x:p.x+(ie.x-p.x)*xe,y:8,z:p.z+(ie.z-p.z)*xe}};for(const X of R){const J=Math.exp(-((D(k,X.angle)/.3)**2));J<.01||(z.radius+=(X.radius-z.radius)*J,z.height+=(X.height-z.height)*J,z.look={x:z.look.x+(X.look.x-z.look.x)*J,y:z.look.y+(X.look.y-z.look.y)*J,z:z.look.z+(X.look.z-z.look.z)*J})}return z},q=k=>{const K=V(k),Y=p.x+Math.cos(k)*K.radius,ie=p.z+Math.sin(k)*K.radius;let xe=0;for(let z=0;z<12;z+=1){const X=z/12*Math.PI*2;xe+=u(Y+Math.cos(X)*70,ie+Math.sin(X)*70)}const O=Math.max(u(Y,ie),(xe/12+u(Y,ie))/2);return{pos:[Y,O+K.height,ie],look:[K.look.x,K.look.y,K.look.z]}},se={x:Math.cos(T),z:Math.sin(T)};_([p.x+se.x*(U+d*.75*y),d*.42,p.z+se.z*(U+d*.75*y)],[p.x,0,p.z]),_([p.x+se.x*(U+d*.3*y),d*.2,p.z+se.z*(U+d*.3*y)],[p.x,0,p.z]);const $=Math.PI/10,ee=new Map;P.forEach((k,K)=>{if(k-T>A)return;let Y=Math.round((k-T)/$);for(;ee.has(Y)&&Y<Math.round(A/$);)Y+=1;ee.set(Y,K)});const ue=Math.round(A/$);for(let k=0;k<=ue;k+=1){const K=q(T+k*$);_(K.pos,K.look,ee.get(k))}const ve=T+A,Me={x:Math.cos(ve+.3),z:Math.sin(ve+.3)};_([p.x+Me.x*(U+d*.35*y),d*.42,p.z+Me.z*(U+d*.35*y)],[p.x,0,p.z]),_([p.x+Me.x*(U+d*.7*y),d*.62,p.z+Me.z*(U+d*.7*y)],[p.x,10,p.z]);const Xe=k=>{const[K,,Y]=m[k-1].pos,[ie,,xe]=m[k].pos,[O,,z]=m[k+1].pos,X=ie-K,J=xe-Y,fe=O-ie,oe=z-xe,I=Math.hypot(X,J),ae=Math.hypot(fe,oe);if(I*ae<1e-6)return{turn:Math.PI,din:{x:0,z:0},dout:{x:0,z:0}};const j={x:X/I,z:J/I},me={x:fe/ae,z:oe/ae};return{turn:Math.acos(Math.max(-1,Math.min(1,j.x*me.x+j.z*me.z))),din:j,dout:me}},Oe=115*Math.PI/180;for(let k=!0,K=0;k&&K<200;K+=1){k=!1;for(let Y=1;Y<m.length-1;Y+=1){const{turn:ie,din:xe,dout:O}=Xe(Y);if(ie<=Oe)continue;if(m[Y].card===void 0||S){m.splice(Y,1),k=!0;break}let z={x:xe.x-O.x,z:xe.z-O.z};const X=Math.hypot(z.x,z.z),J=ie>150*Math.PI/180;z=J||X<.3?{x:-xe.z,z:xe.x}:{x:z.x/X,z:z.z/X};for(let fe=0;fe<(J?25:10)&&Xe(Y).turn>Oe;fe+=1)m[Y].pos[0]+=z.x*30,m[Y].pos[2]+=z.z*30;if(!(Xe(Y).turn>Oe)){k=!0;break}}}const Ue=new yo(m.map(k=>new L(...k.pos)),!1,"centripetal",.5),re=new yo(m.map(k=>new L(...k.look)),!1,"centripetal",.5),le=1600;Ue.arcLengthDivisions=16e3;const ye=Ue.getLength()||1,Ne=k=>{const K=Ue.getPointAt(Math.min(1,Math.max(0,k)));return Math.max(12,K.y-u(K.x,K.z))},we=Number(globalThis.__CITY_CINE_OMEGA__??(S?.62:.55)),Ge=9,Et=120,qe=3,Ve=ye/le,tt=new Float64Array(le);for(let k=0;k<le;k+=1)tt[k]=Math.min(Et,Math.max(Ge,we*Ne((k+.5)/le)));const Ye=Math.max(2,Math.round(80/Ve));let at=new Float64Array(le);for(let k=0;k<le;k+=1){let K=1/0;for(let Y=Math.max(0,k-Ye);Y<=Math.min(le-1,k+Ye);Y+=1)K=Math.min(K,tt[Y]);at[k]=K}for(let k=0;k<2;k+=1){const K=new Float64Array(le);for(let Y=0;Y<le;Y+=1){let ie=0,xe=0;for(let O=Math.max(0,Y-Ye);O<=Math.min(le-1,Y+Ye);O+=1)ie+=at[O],xe+=1;K[Y]=ie/xe}at=K}const yt=(at[0]+at[le-1])*.5*qe,kt=k=>{const K=k*Ve,Y=ye-(k+1)*Ve,ie=Math.min(1,.12+.88*Eh(K/yt),.12+.88*Eh(Y/yt));return at[k]*ie},it=new Float64Array(le+1);for(let k=0;k<le;k+=1)it[k+1]=it[k]+Ve/kt(k);const dt=it[le],G=k=>{if(k<=0)return 0;if(k>=dt)return 1;let K=0,Y=le;for(;Y-K>1;){const ie=K+Y>>1;it[ie]<=k?K=ie:Y=ie}return(K+(k-it[K])/(it[Y]-it[K]||1))/le},zt=Ue.getLengths(),Ke=k=>{const K=k/Math.max(1,m.length-1),ie=zt[Math.round(K*Ue.arcLengthDivisions)]/ye*le,xe=Math.min(le-1,Math.floor(ie));return it[xe]+(it[xe+1]-it[xe])*(ie-xe)},N=k=>{const K=Ue.getPoint(k);return Math.max(12,K.y-u(K.x,K.z))},b=e.windowStartMs,Z=e.windowEndMs,Q=dt*.7,he=[{atSec:.6,untilSec:5.2,kind:"title",text:e.windowLabel,detail:`${e.stats.totalSessions}`}];return m.forEach((k,K)=>{if(k.card===void 0)return;const Y=x[k.card],ie=Ke(K);he.push({atSec:ie-2,untilSec:ie+2.2,kind:"district",text:Y.data.label,detail:`${Y.data.sessionCount}`})}),he.push({atSec:dt-5,untilSec:dt+60,kind:"finale",text:"",detail:""}),{durationSec:dt,position:k=>Ue.getPointAt(G(k)),target:k=>re.getPoint(Ue.getUtoTmapping(G(k),0)),cursor:k=>b+(Z-b)*Eh(k/Q),cards:he,keyTimes:m.map((k,K)=>({seconds:Ke(K),altitude:N(K/Math.max(1,m.length-1))}))}}const Go="system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";function r1(s,e){const t=s.untilSec-s.atSec;if(t<=0||e<s.atSec||e>s.untilSec)return 0;const n=(e-s.atSec)/Math.min(t,s.kind==="finale"?1.6:t);return s.kind==="finale"?Math.min(1,n):n<.18?n/.18:n>.78?Math.max(0,1-(n-.78)/.22):1}function a1(s,e){const{width:t,height:n,seconds:i,durationSec:r}=e;if(e.letterbox>0){const d=Math.max(0,(n-t/e.letterbox)/2)*Math.min(1,i/1.1);s.fillStyle="#050507",s.fillRect(0,0,t,d),s.fillRect(0,n-d,t,d)}const a=e.cards.find(h=>i>=h.atSec&&i<=h.untilSec),o=a?e.describe(a):null;if(a&&o){const h=r1(a,i);if(h>.001){const d=n/1080,u=a.kind==="title"||a.kind==="finale",f=u?t/2:t*.06;let m=u?n*.46:n*.74;s.save(),s.globalAlpha=h,s.textAlign=u?"center":"left",s.textBaseline="alphabetic",s.fillStyle="#fff",s.shadowColor="rgba(0,0,0,0.55)",s.shadowBlur=18*d,s.shadowOffsetY=2*d,o.eyebrow&&(s.font=`600 ${Math.round(14*d)}px ${Go}`,s.globalAlpha=h*.78,s.fillText(o.eyebrow.toUpperCase().split("").join(" "),f,m),s.globalAlpha=h,m+=12*d);const _=Math.round((a.kind==="finale"?84:52)*d);s.font=`700 ${_}px ${Go}`,m+=_,s.fillText(o.title,f,m),o.subtitle&&(s.font=`400 ${Math.round(19*d)}px ${Go}`,s.globalAlpha=h*.9,m+=36*d,s.fillText(o.subtitle,f,m)),s.restore()}}s.save(),s.globalAlpha=.6*Math.min(1,i/1.5),s.fillStyle="#fff",s.shadowColor="rgba(0,0,0,0.5)",s.shadowBlur=8,s.textAlign="right",s.font=`600 ${Math.round(13*(n/1080))}px ${Go}`;const l=e.letterbox>0?n-Math.max(0,(n-t/e.letterbox)/2)-18*(n/1080):n-24*(n/1080);s.fillText(e.watermark,t-28*(n/1080),l),s.restore();const c=Math.max(Math.min(1,1-i/.6),Math.min(1,1-(r-i)/.6));c>.001&&(s.fillStyle=`rgba(5,5,7,${Math.min(1,c)})`,s.fillRect(0,0,t,n))}var Ph=(s,e,t)=>{if(!e.has(s))throw TypeError("Cannot "+t)},H=(s,e,t)=>(Ph(s,e,"read from private field"),t?t.call(s):e.get(s)),et=(s,e,t)=>{if(e.has(s))throw TypeError("Cannot add the same private member more than once");e instanceof WeakSet?e.add(s):e.set(s,t)},cn=(s,e,t,n)=>(Ph(s,e,"write to private field"),e.set(s,t),t),o1=(s,e,t,n)=>({set _(i){cn(s,e,i)},get _(){return H(s,e,n)}}),lt=(s,e,t)=>(Ph(s,e,"access private method"),t),ut=new Uint8Array(8),_i=new DataView(ut.buffer),tn=s=>[(s%256+256)%256],vt=s=>(_i.setUint16(0,s,!1),[ut[0],ut[1]]),l1=s=>(_i.setInt16(0,s,!1),[ut[0],ut[1]]),cp=s=>(_i.setUint32(0,s,!1),[ut[1],ut[2],ut[3]]),Ce=s=>(_i.setUint32(0,s,!1),[ut[0],ut[1],ut[2],ut[3]]),c1=s=>(_i.setInt32(0,s,!1),[ut[0],ut[1],ut[2],ut[3]]),ps=s=>(_i.setUint32(0,Math.floor(s/2**32),!1),_i.setUint32(4,s,!1),[ut[0],ut[1],ut[2],ut[3],ut[4],ut[5],ut[6],ut[7]]),Ih=s=>(_i.setInt16(0,2**8*s,!1),[ut[0],ut[1]]),Mi=s=>(_i.setInt32(0,2**16*s,!1),[ut[0],ut[1],ut[2],ut[3]]),Lh=s=>(_i.setInt32(0,2**30*s,!1),[ut[0],ut[1],ut[2],ut[3]]),Xn=(s,e=!1)=>{let t=Array(s.length).fill(null).map((n,i)=>s.charCodeAt(i));return e&&t.push(0),t},Wo=s=>s&&s[s.length-1],Dh=s=>{let e;for(let t of s)(!e||t.presentationTimestamp>e.presentationTimestamp)&&(e=t);return e},yi=(s,e,t=!0)=>{let n=s*e;return t?Math.round(n):n},hp=s=>{let e=s*(Math.PI/180),t=Math.cos(e),n=Math.sin(e);return[t,n,0,-n,t,0,0,0,1]},up=hp(0),fp=s=>[Mi(s[0]),Mi(s[1]),Lh(s[2]),Mi(s[3]),Mi(s[4]),Lh(s[5]),Mi(s[6]),Mi(s[7]),Lh(s[8])],xa=s=>!s||typeof s!="object"?s:Array.isArray(s)?s.map(xa):Object.fromEntries(Object.entries(s).map(([e,t])=>[e,xa(t)])),or=s=>s>=0&&s<2**32,$t=(s,e,t)=>({type:s,contents:e&&new Uint8Array(e.flat(10)),children:t}),Ut=(s,e,t,n,i)=>$t(s,[tn(e),cp(t),n??[]],i),h1=s=>{let e=512;return s.fragmented?$t("ftyp",[Xn("iso5"),Ce(e),Xn("iso5"),Xn("iso6"),Xn("mp41")]):$t("ftyp",[Xn("isom"),Ce(e),Xn("isom"),s.holdsAvc?Xn("avc1"):[],Xn("mp41")])},Uh=s=>({type:"mdat",largeSize:s}),u1=s=>({type:"free",size:s}),Xo=(s,e,t=!1)=>$t("moov",null,[f1(e,s),...s.map(n=>d1(n,e)),t?W1(s):null]),f1=(s,e)=>{let t=yi(Math.max(0,...e.filter(a=>a.samples.length>0).map(a=>{const o=Dh(a.samples);return o.presentationTimestamp+o.duration})),kh),n=Math.max(...e.map(a=>a.id))+1,i=!or(s)||!or(t),r=i?ps:Ce;return Ut("mvhd",+i,0,[r(s),r(s),Ce(kh),r(t),Mi(1),Ih(1),Array(10).fill(0),fp(up),Array(24).fill(0),Ce(n)])},d1=(s,e)=>$t("trak",null,[p1(s,e),m1(s,e)]),p1=(s,e)=>{let t=Dh(s.samples),n=yi(t?t.presentationTimestamp+t.duration:0,kh),i=!or(e)||!or(n),r=i?ps:Ce,a;return s.info.type==="video"?a=typeof s.info.rotation=="number"?hp(s.info.rotation):s.info.rotation:a=up,Ut("tkhd",+i,3,[r(e),r(e),Ce(s.id),Ce(0),r(n),Array(8).fill(0),vt(0),vt(0),Ih(s.info.type==="audio"?1:0),vt(0),fp(a),Mi(s.info.type==="video"?s.info.width:0),Mi(s.info.type==="video"?s.info.height:0)])},m1=(s,e)=>$t("mdia",null,[g1(s,e),x1(s.info.type==="video"?"vide":"soun"),v1(s)]),g1=(s,e)=>{let t=Dh(s.samples),n=yi(t?t.presentationTimestamp+t.duration:0,s.timescale),i=!or(e)||!or(n),r=i?ps:Ce;return Ut("mdhd",+i,0,[r(e),r(e),Ce(s.timescale),r(n),vt(21956),vt(0)])},x1=s=>Ut("hdlr",0,0,[Xn("mhlr"),Xn(s),Ce(0),Ce(0),Ce(0),Xn("mp4-muxer-hdlr",!0)]),v1=s=>$t("minf",null,[s.info.type==="video"?_1():M1(),y1(),b1(s)]),_1=()=>Ut("vmhd",0,1,[vt(0),vt(0),vt(0),vt(0)]),M1=()=>Ut("smhd",0,0,[vt(0),vt(0)]),y1=()=>$t("dinf",null,[S1()]),S1=()=>Ut("dref",0,0,[Ce(1)],[w1()]),w1=()=>Ut("url ",0,1),b1=s=>{const e=s.compositionTimeOffsetTable.length>1||s.compositionTimeOffsetTable.some(t=>t.sampleCompositionTimeOffset!==0);return $t("stbl",null,[T1(s),O1(s),B1(s),k1(s),V1(s),H1(s),e?G1(s):null])},T1=s=>Ut("stsd",0,0,[Ce(1)],[s.info.type==="video"?A1(ew[s.info.codec],s):N1(nw[s.info.codec],s)]),A1=(s,e)=>$t(s,[Array(6).fill(0),vt(1),vt(0),vt(0),Array(12).fill(0),vt(e.info.width),vt(e.info.height),Ce(4718592),Ce(4718592),Ce(0),vt(1),Array(32).fill(0),vt(24),l1(65535)],[tw[e.info.codec](e),e.info.decoderConfig.colorSpace?P1(e):null]),E1={bt709:1,bt470bg:5,smpte170m:6},C1={bt709:1,smpte170m:6,"iec61966-2-1":13},R1={rgb:0,bt709:1,bt470bg:5,smpte170m:6},P1=s=>$t("colr",[Xn("nclx"),vt(E1[s.info.decoderConfig.colorSpace.primaries]),vt(C1[s.info.decoderConfig.colorSpace.transfer]),vt(R1[s.info.decoderConfig.colorSpace.matrix]),tn((s.info.decoderConfig.colorSpace.fullRange?1:0)<<7)]),I1=s=>s.info.decoderConfig&&$t("avcC",[...new Uint8Array(s.info.decoderConfig.description)]),L1=s=>s.info.decoderConfig&&$t("hvcC",[...new Uint8Array(s.info.decoderConfig.description)]),D1=s=>{if(!s.info.decoderConfig)return null;let e=s.info.decoderConfig;if(!e.colorSpace)throw new Error("'colorSpace' is required in the decoder config for VP9.");let t=e.codec.split("."),n=Number(t[1]),i=Number(t[2]),o=(Number(t[3])<<4)+(0<<1)+Number(e.colorSpace.fullRange);return Ut("vpcC",1,0,[tn(n),tn(i),tn(o),tn(2),tn(2),tn(2),vt(0)])},U1=()=>{let t=(1<<7)+1;return $t("av1C",[t,0,0,0])},N1=(s,e)=>$t(s,[Array(6).fill(0),vt(1),vt(0),vt(0),Ce(0),vt(e.info.numberOfChannels),vt(16),vt(0),vt(0),Mi(e.info.sampleRate)],[iw[e.info.codec](e)]),z1=s=>{let e=new Uint8Array(s.info.decoderConfig.description);return Ut("esds",0,0,[Ce(58753152),tn(32+e.byteLength),vt(1),tn(0),Ce(75530368),tn(18+e.byteLength),tn(64),tn(21),cp(0),Ce(130071),Ce(130071),Ce(92307584),tn(e.byteLength),...e,Ce(109084800),tn(1),tn(2)])},F1=s=>{var i;let e=3840,t=0;const n=(i=s.info.decoderConfig)==null?void 0:i.description;if(n){if(n.byteLength<18)throw new TypeError("Invalid decoder description provided for Opus; must be at least 18 bytes long.");const r=ArrayBuffer.isView(n)?new DataView(n.buffer,n.byteOffset,n.byteLength):new DataView(n);e=r.getUint16(10,!0),t=r.getInt16(14,!0)}return $t("dOps",[tn(0),tn(s.info.numberOfChannels),vt(e),Ce(s.info.sampleRate),Ih(t),tn(0)])},O1=s=>Ut("stts",0,0,[Ce(s.timeToSampleTable.length),s.timeToSampleTable.map(e=>[Ce(e.sampleCount),Ce(e.sampleDelta)])]),B1=s=>{if(s.samples.every(t=>t.type==="key"))return null;let e=[...s.samples.entries()].filter(([,t])=>t.type==="key");return Ut("stss",0,0,[Ce(e.length),e.map(([t])=>Ce(t+1))])},k1=s=>Ut("stsc",0,0,[Ce(s.compactlyCodedChunkTable.length),s.compactlyCodedChunkTable.map(e=>[Ce(e.firstChunk),Ce(e.samplesPerChunk),Ce(1)])]),V1=s=>Ut("stsz",0,0,[Ce(0),Ce(s.samples.length),s.samples.map(e=>Ce(e.size))]),H1=s=>s.finalizedChunks.length>0&&Wo(s.finalizedChunks).offset>=2**32?Ut("co64",0,0,[Ce(s.finalizedChunks.length),s.finalizedChunks.map(e=>ps(e.offset))]):Ut("stco",0,0,[Ce(s.finalizedChunks.length),s.finalizedChunks.map(e=>Ce(e.offset))]),G1=s=>Ut("ctts",0,0,[Ce(s.compositionTimeOffsetTable.length),s.compositionTimeOffsetTable.map(e=>[Ce(e.sampleCount),Ce(e.sampleCompositionTimeOffset)])]),W1=s=>$t("mvex",null,s.map(X1)),X1=s=>Ut("trex",0,0,[Ce(s.id),Ce(1),Ce(0),Ce(0),Ce(0)]),dp=(s,e)=>$t("moof",null,[Y1(s),...e.map(q1)]),Y1=s=>Ut("mfhd",0,0,[Ce(s)]),pp=s=>{let e=0,t=0,n=0,i=0,r=s.type==="delta";return t|=+r,r?e|=1:e|=2,e<<24|t<<16|n<<8|i},q1=s=>$t("traf",null,[Z1(s),$1(s),K1(s)]),Z1=s=>{let e=0;e|=8,e|=16,e|=32,e|=131072;let t=s.currentChunk.samples[1]??s.currentChunk.samples[0],n={duration:t.timescaleUnitsToNextSample,size:t.size,flags:pp(t)};return Ut("tfhd",0,e,[Ce(s.id),Ce(n.duration),Ce(n.size),Ce(n.flags)])},$1=s=>Ut("tfdt",1,0,[ps(yi(s.currentChunk.startTimestamp,s.timescale))]),K1=s=>{let e=s.currentChunk.samples.map(_=>_.timescaleUnitsToNextSample),t=s.currentChunk.samples.map(_=>_.size),n=s.currentChunk.samples.map(pp),i=s.currentChunk.samples.map(_=>yi(_.presentationTimestamp-_.decodeTimestamp,s.timescale)),r=new Set(e),a=new Set(t),o=new Set(n),l=new Set(i),c=o.size===2&&n[0]!==n[1],h=r.size>1,d=a.size>1,u=!c&&o.size>1,f=l.size>1||[...l].some(_=>_!==0),m=0;return m|=1,m|=4*+c,m|=256*+h,m|=512*+d,m|=1024*+u,m|=2048*+f,Ut("trun",1,m,[Ce(s.currentChunk.samples.length),Ce(s.currentChunk.offset-s.currentChunk.moofOffset||0),c?Ce(n[0]):[],s.currentChunk.samples.map((_,p)=>[h?Ce(e[p]):[],d?Ce(t[p]):[],u?Ce(n[p]):[],f?c1(i[p]):[]])])},J1=s=>$t("mfra",null,[...s.map(j1),Q1()]),j1=(s,e)=>Ut("tfra",1,0,[Ce(s.id),Ce(63),Ce(s.finalizedChunks.length),s.finalizedChunks.map(n=>[ps(yi(n.startTimestamp,s.timescale)),ps(n.moofOffset),Ce(e+1),Ce(1),Ce(1)])]),Q1=()=>Ut("mfro",0,0,[Ce(0)]),ew={avc:"avc1",hevc:"hvc1",vp9:"vp09",av1:"av01"},tw={avc:I1,hevc:L1,vp9:D1,av1:U1},nw={aac:"mp4a",opus:"Opus"},iw={aac:z1,opus:F1},Yo=class{},mp=class extends Yo{constructor(){super(...arguments),this.buffer=null}},gp=class extends Yo{constructor(s){if(super(),this.options=s,typeof s!="object")throw new TypeError("StreamTarget requires an options object to be passed to its constructor.");if(s.onData){if(typeof s.onData!="function")throw new TypeError("options.onData, when provided, must be a function.");if(s.onData.length<2)throw new TypeError("options.onData, when provided, must be a function that takes in at least two arguments (data and position). Ignoring the position argument, which specifies the byte offset at which the data is to be written, can lead to broken outputs.")}if(s.chunked!==void 0&&typeof s.chunked!="boolean")throw new TypeError("options.chunked, when provided, must be a boolean.");if(s.chunkSize!==void 0&&(!Number.isInteger(s.chunkSize)||s.chunkSize<1024))throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.")}},sw=class extends Yo{constructor(s,e){if(super(),this.stream=s,this.options=e,!(s instanceof FileSystemWritableFileStream))throw new TypeError("FileSystemWritableFileStreamTarget requires a FileSystemWritableFileStream instance.");if(e!==void 0&&typeof e!="object")throw new TypeError("FileSystemWritableFileStreamTarget's options, when provided, must be an object.");if(e&&e.chunkSize!==void 0&&(!Number.isInteger(e.chunkSize)||e.chunkSize<=0))throw new TypeError("options.chunkSize, when provided, must be a positive integer")}},ms,lr,xp=class{constructor(){this.pos=0,et(this,ms,new Uint8Array(8)),et(this,lr,new DataView(H(this,ms).buffer)),this.offsets=new WeakMap}seek(s){this.pos=s}writeU32(s){H(this,lr).setUint32(0,s,!1),this.write(H(this,ms).subarray(0,4))}writeU64(s){H(this,lr).setUint32(0,Math.floor(s/2**32),!1),H(this,lr).setUint32(4,s,!1),this.write(H(this,ms).subarray(0,8))}writeAscii(s){for(let e=0;e<s.length;e++)H(this,lr).setUint8(e%8,s.charCodeAt(e)),e%8===7&&this.write(H(this,ms));s.length%8!==0&&this.write(H(this,ms).subarray(0,s.length%8))}writeBox(s){if(this.offsets.set(s,this.pos),s.contents&&!s.children)this.writeBoxHeader(s,s.size??s.contents.byteLength+8),this.write(s.contents);else{let e=this.pos;if(this.writeBoxHeader(s,0),s.contents&&this.write(s.contents),s.children)for(let i of s.children)i&&this.writeBox(i);let t=this.pos,n=s.size??t-e;this.seek(e),this.writeBoxHeader(s,n),this.seek(t)}}writeBoxHeader(s,e){this.writeU32(s.largeSize?1:e),this.writeAscii(s.type),s.largeSize&&this.writeU64(e)}measureBoxHeader(s){return 8+(s.largeSize?8:0)}patchBox(s){let e=this.pos;this.seek(this.offsets.get(s)),this.writeBox(s),this.seek(e)}measureBox(s){if(s.contents&&!s.children)return this.measureBoxHeader(s)+s.contents.byteLength;{let e=this.measureBoxHeader(s);if(s.contents&&(e+=s.contents.byteLength),s.children)for(let t of s.children)t&&(e+=this.measureBox(t));return e}}};ms=new WeakMap,lr=new WeakMap;var qo,gs,va,_a,Zo,Nh,rw=class extends xp{constructor(s){super(),et(this,Zo),et(this,qo,void 0),et(this,gs,new ArrayBuffer(2**16)),et(this,va,new Uint8Array(H(this,gs))),et(this,_a,0),cn(this,qo,s)}write(s){lt(this,Zo,Nh).call(this,this.pos+s.byteLength),H(this,va).set(s,this.pos),this.pos+=s.byteLength,cn(this,_a,Math.max(H(this,_a),this.pos))}finalize(){lt(this,Zo,Nh).call(this,this.pos),H(this,qo).buffer=H(this,gs).slice(0,Math.max(H(this,_a),this.pos))}};qo=new WeakMap,gs=new WeakMap,va=new WeakMap,_a=new WeakMap,Zo=new WeakSet,Nh=function(s){let e=H(this,gs).byteLength;for(;e<s;)e*=2;if(e===H(this,gs).byteLength)return;let t=new ArrayBuffer(e),n=new Uint8Array(t);n.set(H(this,va),0),cn(this,gs,t),cn(this,va,n)};var aw=2**24,ow=2,Ma,xs,ya,Fi,Un,$o,zh,Fh,vp,Oh,_p,Sa,Ko,Bh=class extends xp{constructor(s){var e,t;super(),et(this,$o),et(this,Fh),et(this,Oh),et(this,Sa),et(this,Ma,void 0),et(this,xs,[]),et(this,ya,void 0),et(this,Fi,void 0),et(this,Un,[]),cn(this,Ma,s),cn(this,ya,((e=s.options)==null?void 0:e.chunked)??!1),cn(this,Fi,((t=s.options)==null?void 0:t.chunkSize)??aw)}write(s){H(this,xs).push({data:s.slice(),start:this.pos}),this.pos+=s.byteLength}flush(){var t,n;if(H(this,xs).length===0)return;let s=[],e=[...H(this,xs)].sort((i,r)=>i.start-r.start);s.push({start:e[0].start,size:e[0].data.byteLength});for(let i=1;i<e.length;i++){let r=s[s.length-1],a=e[i];a.start<=r.start+r.size?r.size=Math.max(r.size,a.start+a.data.byteLength-r.start):s.push({start:a.start,size:a.data.byteLength})}for(let i of s){i.data=new Uint8Array(i.size);for(let r of H(this,xs))i.start<=r.start&&r.start<i.start+i.size&&i.data.set(r.data,r.start-i.start);H(this,ya)?(lt(this,$o,zh).call(this,i.data,i.start),lt(this,Sa,Ko).call(this)):(n=(t=H(this,Ma).options).onData)==null||n.call(t,i.data,i.start)}H(this,xs).length=0}finalize(){H(this,ya)&&lt(this,Sa,Ko).call(this,!0)}};Ma=new WeakMap,xs=new WeakMap,ya=new WeakMap,Fi=new WeakMap,Un=new WeakMap,$o=new WeakSet,zh=function(s,e){let t=H(this,Un).findIndex(o=>o.start<=e&&e<o.start+H(this,Fi));t===-1&&(t=lt(this,Oh,_p).call(this,e));let n=H(this,Un)[t],i=e-n.start,r=s.subarray(0,Math.min(H(this,Fi)-i,s.byteLength));n.data.set(r,i);let a={start:i,end:i+r.byteLength};if(lt(this,Fh,vp).call(this,n,a),n.written[0].start===0&&n.written[0].end===H(this,Fi)&&(n.shouldFlush=!0),H(this,Un).length>ow){for(let o=0;o<H(this,Un).length-1;o++)H(this,Un)[o].shouldFlush=!0;lt(this,Sa,Ko).call(this)}r.byteLength<s.byteLength&&lt(this,$o,zh).call(this,s.subarray(r.byteLength),e+r.byteLength)},Fh=new WeakSet,vp=function(s,e){let t=0,n=s.written.length-1,i=-1;for(;t<=n;){let r=Math.floor(t+(n-t+1)/2);s.written[r].start<=e.start?(t=r+1,i=r):n=r-1}for(s.written.splice(i+1,0,e),(i===-1||s.written[i].end<e.start)&&i++;i<s.written.length-1&&s.written[i].end>=s.written[i+1].start;)s.written[i].end=Math.max(s.written[i].end,s.written[i+1].end),s.written.splice(i+1,1)},Oh=new WeakSet,_p=function(s){let t={start:Math.floor(s/H(this,Fi))*H(this,Fi),data:new Uint8Array(H(this,Fi)),written:[],shouldFlush:!1};return H(this,Un).push(t),H(this,Un).sort((n,i)=>n.start-i.start),H(this,Un).indexOf(t)},Sa=new WeakSet,Ko=function(s=!1){var e,t;for(let n=0;n<H(this,Un).length;n++){let i=H(this,Un)[n];if(!(!i.shouldFlush&&!s)){for(let r of i.written)(t=(e=H(this,Ma).options).onData)==null||t.call(e,i.data.subarray(r.start,r.end),i.start+r.start);H(this,Un).splice(n--,1)}}};var lw=class extends Bh{constructor(s){var e;super(new gp({onData:(t,n)=>s.stream.write({type:"write",data:t,position:n}),chunked:!0,chunkSize:(e=s.options)==null?void 0:e.chunkSize}))}},kh=1e3,cw=["avc","hevc","vp9","av1"],hw=["aac","opus"],uw=2082844800,fw=["strict","offset","cross-track-offset"],ke,We,Jo,Nn,dn,hn,cr,hr,Vh,vs,_s,wa,Hh,Mp,Gh,yp,Wh,Sp,Xh,wp,Yh,bp,jo,qh,Si,Oi,Zh,Tp,ba,Qo,el,$h,ur,Ta,tl,Kh,dw=class{constructor(s){if(et(this,Hh),et(this,Gh),et(this,Wh),et(this,Xh),et(this,Yh),et(this,jo),et(this,Si),et(this,Zh),et(this,ba),et(this,el),et(this,ur),et(this,tl),et(this,ke,void 0),et(this,We,void 0),et(this,Jo,void 0),et(this,Nn,void 0),et(this,dn,null),et(this,hn,null),et(this,cr,Math.floor(Date.now()/1e3)+uw),et(this,hr,[]),et(this,Vh,1),et(this,vs,[]),et(this,_s,[]),et(this,wa,!1),lt(this,Hh,Mp).call(this,s),s.video=xa(s.video),s.audio=xa(s.audio),s.fastStart=xa(s.fastStart),this.target=s.target,cn(this,ke,{firstTimestampBehavior:"strict",...s}),s.target instanceof mp)cn(this,We,new rw(s.target));else if(s.target instanceof gp)cn(this,We,new Bh(s.target));else if(s.target instanceof sw)cn(this,We,new lw(s.target));else throw new Error(`Invalid target: ${s.target}`);lt(this,Xh,wp).call(this),lt(this,Gh,yp).call(this)}addVideoChunk(s,e,t,n){if(!(s instanceof EncodedVideoChunk))throw new TypeError("addVideoChunk's first argument (sample) must be of type EncodedVideoChunk.");if(e&&typeof e!="object")throw new TypeError("addVideoChunk's second argument (meta), when provided, must be an object.");if(t!==void 0&&(!Number.isFinite(t)||t<0))throw new TypeError("addVideoChunk's third argument (timestamp), when provided, must be a non-negative real number.");if(n!==void 0&&!Number.isFinite(n))throw new TypeError("addVideoChunk's fourth argument (compositionTimeOffset), when provided, must be a real number.");let i=new Uint8Array(s.byteLength);s.copyTo(i),this.addVideoChunkRaw(i,s.type,t??s.timestamp,s.duration,e,n)}addVideoChunkRaw(s,e,t,n,i,r){if(!(s instanceof Uint8Array))throw new TypeError("addVideoChunkRaw's first argument (data) must be an instance of Uint8Array.");if(e!=="key"&&e!=="delta")throw new TypeError("addVideoChunkRaw's second argument (type) must be either 'key' or 'delta'.");if(!Number.isFinite(t)||t<0)throw new TypeError("addVideoChunkRaw's third argument (timestamp) must be a non-negative real number.");if(!Number.isFinite(n)||n<0)throw new TypeError("addVideoChunkRaw's fourth argument (duration) must be a non-negative real number.");if(i&&typeof i!="object")throw new TypeError("addVideoChunkRaw's fifth argument (meta), when provided, must be an object.");if(r!==void 0&&!Number.isFinite(r))throw new TypeError("addVideoChunkRaw's sixth argument (compositionTimeOffset), when provided, must be a real number.");if(lt(this,tl,Kh).call(this),!H(this,ke).video)throw new Error("No video track declared.");if(typeof H(this,ke).fastStart=="object"&&H(this,dn).samples.length===H(this,ke).fastStart.expectedVideoChunks)throw new Error(`Cannot add more video chunks than specified in 'fastStart' (${H(this,ke).fastStart.expectedVideoChunks}).`);let a=lt(this,jo,qh).call(this,H(this,dn),s,e,t,n,i,r);if(H(this,ke).fastStart==="fragmented"&&H(this,hn)){for(;H(this,_s).length>0&&H(this,_s)[0].decodeTimestamp<=a.decodeTimestamp;){let o=H(this,_s).shift();lt(this,Si,Oi).call(this,H(this,hn),o)}a.decodeTimestamp<=H(this,hn).lastDecodeTimestamp?lt(this,Si,Oi).call(this,H(this,dn),a):H(this,vs).push(a)}else lt(this,Si,Oi).call(this,H(this,dn),a)}addAudioChunk(s,e,t){if(!(s instanceof EncodedAudioChunk))throw new TypeError("addAudioChunk's first argument (sample) must be of type EncodedAudioChunk.");if(e&&typeof e!="object")throw new TypeError("addAudioChunk's second argument (meta), when provided, must be an object.");if(t!==void 0&&(!Number.isFinite(t)||t<0))throw new TypeError("addAudioChunk's third argument (timestamp), when provided, must be a non-negative real number.");let n=new Uint8Array(s.byteLength);s.copyTo(n),this.addAudioChunkRaw(n,s.type,t??s.timestamp,s.duration,e)}addAudioChunkRaw(s,e,t,n,i){if(!(s instanceof Uint8Array))throw new TypeError("addAudioChunkRaw's first argument (data) must be an instance of Uint8Array.");if(e!=="key"&&e!=="delta")throw new TypeError("addAudioChunkRaw's second argument (type) must be either 'key' or 'delta'.");if(!Number.isFinite(t)||t<0)throw new TypeError("addAudioChunkRaw's third argument (timestamp) must be a non-negative real number.");if(!Number.isFinite(n)||n<0)throw new TypeError("addAudioChunkRaw's fourth argument (duration) must be a non-negative real number.");if(i&&typeof i!="object")throw new TypeError("addAudioChunkRaw's fifth argument (meta), when provided, must be an object.");if(lt(this,tl,Kh).call(this),!H(this,ke).audio)throw new Error("No audio track declared.");if(typeof H(this,ke).fastStart=="object"&&H(this,hn).samples.length===H(this,ke).fastStart.expectedAudioChunks)throw new Error(`Cannot add more audio chunks than specified in 'fastStart' (${H(this,ke).fastStart.expectedAudioChunks}).`);let r=lt(this,jo,qh).call(this,H(this,hn),s,e,t,n,i);if(H(this,ke).fastStart==="fragmented"&&H(this,dn)){for(;H(this,vs).length>0&&H(this,vs)[0].decodeTimestamp<=r.decodeTimestamp;){let a=H(this,vs).shift();lt(this,Si,Oi).call(this,H(this,dn),a)}r.decodeTimestamp<=H(this,dn).lastDecodeTimestamp?lt(this,Si,Oi).call(this,H(this,hn),r):H(this,_s).push(r)}else lt(this,Si,Oi).call(this,H(this,hn),r)}finalize(){if(H(this,wa))throw new Error("Cannot finalize a muxer more than once.");if(H(this,ke).fastStart==="fragmented"){for(let e of H(this,vs))lt(this,Si,Oi).call(this,H(this,dn),e);for(let e of H(this,_s))lt(this,Si,Oi).call(this,H(this,hn),e);lt(this,el,$h).call(this,!1)}else H(this,dn)&&lt(this,ba,Qo).call(this,H(this,dn)),H(this,hn)&&lt(this,ba,Qo).call(this,H(this,hn));let s=[H(this,dn),H(this,hn)].filter(Boolean);if(H(this,ke).fastStart==="in-memory"){let e;for(let n=0;n<2;n++){let i=Xo(s,H(this,cr)),r=H(this,We).measureBox(i);e=H(this,We).measureBox(H(this,Nn));let a=H(this,We).pos+r+e;for(let o of H(this,hr)){o.offset=a;for(let{data:l}of o.samples)a+=l.byteLength,e+=l.byteLength}if(a<2**32)break;e>=2**32&&(H(this,Nn).largeSize=!0)}let t=Xo(s,H(this,cr));H(this,We).writeBox(t),H(this,Nn).size=e,H(this,We).writeBox(H(this,Nn));for(let n of H(this,hr))for(let i of n.samples)H(this,We).write(i.data),i.data=null}else if(H(this,ke).fastStart==="fragmented"){let e=H(this,We).pos,t=J1(s);H(this,We).writeBox(t);let n=H(this,We).pos-e;H(this,We).seek(H(this,We).pos-4),H(this,We).writeU32(n)}else{let e=H(this,We).offsets.get(H(this,Nn)),t=H(this,We).pos-e;H(this,Nn).size=t,H(this,Nn).largeSize=t>=2**32,H(this,We).patchBox(H(this,Nn));let n=Xo(s,H(this,cr));if(typeof H(this,ke).fastStart=="object"){H(this,We).seek(H(this,Jo)),H(this,We).writeBox(n);let i=e-H(this,We).pos;H(this,We).writeBox(u1(i))}else H(this,We).writeBox(n)}lt(this,ur,Ta).call(this),H(this,We).finalize(),cn(this,wa,!0)}};ke=new WeakMap,We=new WeakMap,Jo=new WeakMap,Nn=new WeakMap,dn=new WeakMap,hn=new WeakMap,cr=new WeakMap,hr=new WeakMap,Vh=new WeakMap,vs=new WeakMap,_s=new WeakMap,wa=new WeakMap,Hh=new WeakSet,Mp=function(s){if(typeof s!="object")throw new TypeError("The muxer requires an options object to be passed to its constructor.");if(!(s.target instanceof Yo))throw new TypeError("The target must be provided and an instance of Target.");if(s.video){if(!cw.includes(s.video.codec))throw new TypeError(`Unsupported video codec: ${s.video.codec}`);if(!Number.isInteger(s.video.width)||s.video.width<=0)throw new TypeError(`Invalid video width: ${s.video.width}. Must be a positive integer.`);if(!Number.isInteger(s.video.height)||s.video.height<=0)throw new TypeError(`Invalid video height: ${s.video.height}. Must be a positive integer.`);const e=s.video.rotation;if(typeof e=="number"&&![0,90,180,270].includes(e))throw new TypeError(`Invalid video rotation: ${e}. Has to be 0, 90, 180 or 270.`);if(Array.isArray(e)&&(e.length!==9||e.some(t=>typeof t!="number")))throw new TypeError(`Invalid video transformation matrix: ${e.join()}`);if(s.video.frameRate!==void 0&&(!Number.isInteger(s.video.frameRate)||s.video.frameRate<=0))throw new TypeError(`Invalid video frame rate: ${s.video.frameRate}. Must be a positive integer.`)}if(s.audio){if(!hw.includes(s.audio.codec))throw new TypeError(`Unsupported audio codec: ${s.audio.codec}`);if(!Number.isInteger(s.audio.numberOfChannels)||s.audio.numberOfChannels<=0)throw new TypeError(`Invalid number of audio channels: ${s.audio.numberOfChannels}. Must be a positive integer.`);if(!Number.isInteger(s.audio.sampleRate)||s.audio.sampleRate<=0)throw new TypeError(`Invalid audio sample rate: ${s.audio.sampleRate}. Must be a positive integer.`)}if(s.firstTimestampBehavior&&!fw.includes(s.firstTimestampBehavior))throw new TypeError(`Invalid first timestamp behavior: ${s.firstTimestampBehavior}`);if(typeof s.fastStart=="object"){if(s.video){if(s.fastStart.expectedVideoChunks===void 0)throw new TypeError("'fastStart' is an object but is missing property 'expectedVideoChunks'.");if(!Number.isInteger(s.fastStart.expectedVideoChunks)||s.fastStart.expectedVideoChunks<0)throw new TypeError("'expectedVideoChunks' must be a non-negative integer.")}if(s.audio){if(s.fastStart.expectedAudioChunks===void 0)throw new TypeError("'fastStart' is an object but is missing property 'expectedAudioChunks'.");if(!Number.isInteger(s.fastStart.expectedAudioChunks)||s.fastStart.expectedAudioChunks<0)throw new TypeError("'expectedAudioChunks' must be a non-negative integer.")}}else if(![!1,"in-memory","fragmented"].includes(s.fastStart))throw new TypeError("'fastStart' option must be false, 'in-memory', 'fragmented' or an object.");if(s.minFragmentDuration!==void 0&&(!Number.isFinite(s.minFragmentDuration)||s.minFragmentDuration<0))throw new TypeError("'minFragmentDuration' must be a non-negative number.")},Gh=new WeakSet,yp=function(){var s;if(H(this,We).writeBox(h1({holdsAvc:((s=H(this,ke).video)==null?void 0:s.codec)==="avc",fragmented:H(this,ke).fastStart==="fragmented"})),cn(this,Jo,H(this,We).pos),H(this,ke).fastStart==="in-memory")cn(this,Nn,Uh(!1));else if(H(this,ke).fastStart!=="fragmented"){if(typeof H(this,ke).fastStart=="object"){let e=lt(this,Wh,Sp).call(this);H(this,We).seek(H(this,We).pos+e)}cn(this,Nn,Uh(!0)),H(this,We).writeBox(H(this,Nn))}lt(this,ur,Ta).call(this)},Wh=new WeakSet,Sp=function(){if(typeof H(this,ke).fastStart!="object")return;let s=0,e=[H(this,ke).fastStart.expectedVideoChunks,H(this,ke).fastStart.expectedAudioChunks];for(let t of e)t&&(s+=8*Math.ceil(2/3*t),s+=4*t,s+=12*Math.ceil(2/3*t),s+=4*t,s+=8*t);return s+=4096,s},Xh=new WeakSet,wp=function(){if(H(this,ke).video&&cn(this,dn,{id:1,info:{type:"video",codec:H(this,ke).video.codec,width:H(this,ke).video.width,height:H(this,ke).video.height,rotation:H(this,ke).video.rotation??0,decoderConfig:null},timescale:H(this,ke).video.frameRate??57600,samples:[],finalizedChunks:[],currentChunk:null,firstDecodeTimestamp:void 0,lastDecodeTimestamp:-1,timeToSampleTable:[],compositionTimeOffsetTable:[],lastTimescaleUnits:null,lastSample:null,compactlyCodedChunkTable:[]}),H(this,ke).audio&&(cn(this,hn,{id:H(this,ke).video?2:1,info:{type:"audio",codec:H(this,ke).audio.codec,numberOfChannels:H(this,ke).audio.numberOfChannels,sampleRate:H(this,ke).audio.sampleRate,decoderConfig:null},timescale:H(this,ke).audio.sampleRate,samples:[],finalizedChunks:[],currentChunk:null,firstDecodeTimestamp:void 0,lastDecodeTimestamp:-1,timeToSampleTable:[],compositionTimeOffsetTable:[],lastTimescaleUnits:null,lastSample:null,compactlyCodedChunkTable:[]}),H(this,ke).audio.codec==="aac")){let s=lt(this,Yh,bp).call(this,2,H(this,ke).audio.sampleRate,H(this,ke).audio.numberOfChannels);H(this,hn).info.decoderConfig={codec:H(this,ke).audio.codec,description:s,numberOfChannels:H(this,ke).audio.numberOfChannels,sampleRate:H(this,ke).audio.sampleRate}}},Yh=new WeakSet,bp=function(s,e,t){let i=[96e3,88200,64e3,48e3,44100,32e3,24e3,22050,16e3,12e3,11025,8e3,7350].indexOf(e),r=t,a="";a+=s.toString(2).padStart(5,"0"),a+=i.toString(2).padStart(4,"0"),i===15&&(a+=e.toString(2).padStart(24,"0")),a+=r.toString(2).padStart(4,"0");let o=Math.ceil(a.length/8)*8;a=a.padEnd(o,"0");let l=new Uint8Array(a.length/8);for(let c=0;c<a.length;c+=8)l[c/8]=parseInt(a.slice(c,c+8),2);return l},jo=new WeakSet,qh=function(s,e,t,n,i,r,a){let o=n/1e6,l=(n-(a??0))/1e6,c=i/1e6,h=lt(this,Zh,Tp).call(this,o,l,s);return o=h.presentationTimestamp,l=h.decodeTimestamp,r!=null&&r.decoderConfig&&(s.info.decoderConfig===null?s.info.decoderConfig=r.decoderConfig:Object.assign(s.info.decoderConfig,r.decoderConfig)),{presentationTimestamp:o,decodeTimestamp:l,duration:c,data:e,size:e.byteLength,type:t,timescaleUnitsToNextSample:yi(c,s.timescale)}},Si=new WeakSet,Oi=function(s,e){H(this,ke).fastStart!=="fragmented"&&s.samples.push(e);const t=yi(e.presentationTimestamp-e.decodeTimestamp,s.timescale);if(s.lastTimescaleUnits!==null){let i=yi(e.decodeTimestamp,s.timescale,!1),r=Math.round(i-s.lastTimescaleUnits);if(s.lastTimescaleUnits+=r,s.lastSample.timescaleUnitsToNextSample=r,H(this,ke).fastStart!=="fragmented"){let a=Wo(s.timeToSampleTable);a.sampleCount===1?(a.sampleDelta=r,a.sampleCount++):a.sampleDelta===r?a.sampleCount++:(a.sampleCount--,s.timeToSampleTable.push({sampleCount:2,sampleDelta:r}));const o=Wo(s.compositionTimeOffsetTable);o.sampleCompositionTimeOffset===t?o.sampleCount++:s.compositionTimeOffsetTable.push({sampleCount:1,sampleCompositionTimeOffset:t})}}else s.lastTimescaleUnits=0,H(this,ke).fastStart!=="fragmented"&&(s.timeToSampleTable.push({sampleCount:1,sampleDelta:yi(e.duration,s.timescale)}),s.compositionTimeOffsetTable.push({sampleCount:1,sampleCompositionTimeOffset:t}));s.lastSample=e;let n=!1;if(!s.currentChunk)n=!0;else{let i=e.presentationTimestamp-s.currentChunk.startTimestamp;if(H(this,ke).fastStart==="fragmented"){let r=H(this,dn)??H(this,hn);const a=H(this,ke).minFragmentDuration??1;s===r&&e.type==="key"&&i>=a&&(n=!0,lt(this,el,$h).call(this))}else n=i>=.5}n&&(s.currentChunk&&lt(this,ba,Qo).call(this,s),s.currentChunk={startTimestamp:e.presentationTimestamp,samples:[]}),s.currentChunk.samples.push(e)},Zh=new WeakSet,Tp=function(s,e,t){var a,o;const n=H(this,ke).firstTimestampBehavior==="strict",i=t.lastDecodeTimestamp===-1;if(n&&i&&e!==0)throw new Error(`The first chunk for your media track must have a timestamp of 0 (received DTS=${e}).Non-zero first timestamps are often caused by directly piping frames or audio data from a MediaStreamTrack into the encoder. Their timestamps are typically relative to the age of thedocument, which is probably what you want.

If you want to offset all timestamps of a track such that the first one is zero, set firstTimestampBehavior: 'offset' in the options.
`);if(H(this,ke).firstTimestampBehavior==="offset"||H(this,ke).firstTimestampBehavior==="cross-track-offset"){t.firstDecodeTimestamp===void 0&&(t.firstDecodeTimestamp=e);let l;H(this,ke).firstTimestampBehavior==="offset"?l=t.firstDecodeTimestamp:l=Math.min(((a=H(this,dn))==null?void 0:a.firstDecodeTimestamp)??1/0,((o=H(this,hn))==null?void 0:o.firstDecodeTimestamp)??1/0),e-=l,s-=l}if(e<t.lastDecodeTimestamp)throw new Error(`Timestamps must be monotonically increasing (DTS went from ${t.lastDecodeTimestamp*1e6} to ${e*1e6}).`);return t.lastDecodeTimestamp=e,{presentationTimestamp:s,decodeTimestamp:e}},ba=new WeakSet,Qo=function(s){if(H(this,ke).fastStart==="fragmented")throw new Error("Can't finalize individual chunks if 'fastStart' is set to 'fragmented'.");if(s.currentChunk){if(s.finalizedChunks.push(s.currentChunk),H(this,hr).push(s.currentChunk),(s.compactlyCodedChunkTable.length===0||Wo(s.compactlyCodedChunkTable).samplesPerChunk!==s.currentChunk.samples.length)&&s.compactlyCodedChunkTable.push({firstChunk:s.finalizedChunks.length,samplesPerChunk:s.currentChunk.samples.length}),H(this,ke).fastStart==="in-memory"){s.currentChunk.offset=0;return}s.currentChunk.offset=H(this,We).pos;for(let e of s.currentChunk.samples)H(this,We).write(e.data),e.data=null;lt(this,ur,Ta).call(this)}},el=new WeakSet,$h=function(s=!0){if(H(this,ke).fastStart!=="fragmented")throw new Error("Can't finalize a fragment unless 'fastStart' is set to 'fragmented'.");let e=[H(this,dn),H(this,hn)].filter(o=>o&&o.currentChunk);if(e.length===0)return;let t=o1(this,Vh)._++;if(t===1){let o=Xo(e,H(this,cr),!0);H(this,We).writeBox(o)}let n=H(this,We).pos,i=dp(t,e);H(this,We).writeBox(i);{let o=Uh(!1),l=0;for(let h of e)for(let d of h.currentChunk.samples)l+=d.size;let c=H(this,We).measureBox(o)+l;c>=2**32&&(o.largeSize=!0,c=H(this,We).measureBox(o)+l),o.size=c,H(this,We).writeBox(o)}for(let o of e){o.currentChunk.offset=H(this,We).pos,o.currentChunk.moofOffset=n;for(let l of o.currentChunk.samples)H(this,We).write(l.data),l.data=null}let r=H(this,We).pos;H(this,We).seek(H(this,We).offsets.get(i));let a=dp(t,e);H(this,We).writeBox(a),H(this,We).seek(r);for(let o of e)o.finalizedChunks.push(o.currentChunk),H(this,hr).push(o.currentChunk),o.currentChunk=null;s&&lt(this,ur,Ta).call(this)},ur=new WeakSet,Ta=function(){H(this,We)instanceof Bh&&H(this,We).flush()},tl=new WeakSet,Kh=function(){if(H(this,wa))throw new Error("Cannot add new video or audio chunks after the file has been finalized.")};class pw{constructor(e,t,n){F(this,"target",new mp);F(this,"muxer");F(this,"failure",null);this.muxer=new dw({target:this.target,video:{codec:"avc",width:t,height:n,frameRate:e},fastStart:"in-memory",firstTimestampBehavior:"strict"})}async start(){}addChunk(e,t){if(!this.failure)try{this.muxer.addVideoChunk(e,t)}catch(n){this.failure=n}}async drain(){if(this.failure)throw this.failure}async finish(){var e;if(await this.drain(),this.muxer.finalize(),!((e=this.target.buffer)!=null&&e.byteLength))throw new Error("background_export_failed");return new Blob([this.target.buffer],{type:"video/mp4"})}async cancel(){this.failure??(this.failure=new DOMException("aborted","AbortError"))}}function Be(s){let e=2166136261;for(let t=0;t<s.length;t+=1)e^=s.charCodeAt(t),e=Math.imul(e,16777619);return(e>>>0)/4294967296}function mw(s,e,t,n=0){if(e<s.startedAt)return 0;if(s.active&&t)return s.builtFraction;const i=(s.endedAt??s.startedAt)-s.startedAt;let r=i;if(n>0){const o=(.9+s.seed*.6)*n;r=Math.min(Math.max(i,o),3.5*n)}if(!Number.isFinite(r)||r<=0)return 1;if(s.aggregated&&n<=0)return e>=s.startedAt?1:0;const a=(e-s.startedAt)/r;return Math.min(1,Math.max(.04,a))}function nl(s,e,t){let n=(t|0)^Math.imul(s|0,374761393)^Math.imul(e|0,668265263);return n=Math.imul(n^n>>>13,1274126177),((n^n>>>16)>>>0)/4294967296}function Ap(s){return s*s*(3-2*s)}function gw(s,e,t){const n=Math.floor(s),i=Math.floor(e),r=Ap(s-n),a=Ap(e-i),o=nl(n,i,t),l=nl(n+1,i,t),c=nl(n,i+1,t),h=nl(n+1,i+1,t);return o+(l-o)*r+(c-o)*a+(o-l-c+h)*r*a}function fr(s,e,t,n=3){let i=0,r=.5,a=1,o=0;for(let l=0;l<n;l+=1)i+=(gw(s*a,e*a,t+l*1013)-.5)*2*r,o+=r,r*=.5,a*=2.07;return i/o}function Jh(s,e,t){const n=Math.min(1,Math.max(0,(t-s)/(e-s||1e-6)));return n*n*(3-2*n)}function dr(s,e,t){const n=t.x-e.x,i=t.z-e.z,r=Math.max(0,Math.min(1,((s.x-e.x)*n+(s.z-e.z)*i)/(n*n+i*i||1)));return Math.hypot(s.x-e.x-n*r,s.z-e.z-i*r)}function Ep(s,e){let t=!1,n=1/0;for(let i=0,r=e.length-1;i<e.length;r=i++){const a=e[i],o=e[r];a.z>s.z!=o.z>s.z&&s.x<(o.x-a.x)*(s.z-a.z)/(o.z-a.z)+a.x&&(t=!t),n=Math.min(n,dr(s,a,o))}return t?n:-n}const jh=s=>`${s.x}:${s.z}`;class pr{constructor(e){F(this,"cell",60);F(this,"cells",new Map);for(const t of e)for(let n=1;n<t.length;n+=1)this.add(t[n-1],t[n])}add(e,t){const n=this.cell;for(let i=Math.floor(Math.min(e.x,t.x)/n);i<=Math.floor(Math.max(e.x,t.x)/n);i+=1)for(let r=Math.floor(Math.min(e.z,t.z)/n);r<=Math.floor(Math.max(e.z,t.z)/n);r+=1){const a=`${i}:${r}`,o=this.cells.get(a);o?o.push([e,t]):this.cells.set(a,[[e,t]])}}closerThan(e,t){const n=Math.floor(e.x/this.cell),i=Math.floor(e.z/this.cell),r=Math.ceil(t/this.cell);for(let a=-r;a<=r;a+=1)for(let o=-r;o<=r;o+=1){const l=this.cells.get(`${n+a}:${i+o}`);if(l){for(const[c,h]of l)if(dr(e,c,h)<t)return!0}}return!1}}function mr(s,e,t,n){const i=5.25+Math.hypot(e,t)/2+1;if(n instanceof pr)return!n.closerThan(s,i);for(const r of n)for(let a=1;a<r.length;a+=1)if(dr(s,r[a-1],r[a])<i)return!1;return!0}const Qh=["tropical","temperate","boreal","savanna","eastasian"],Cp=400,xw=5;function vw(s){return Math.max(1,Math.min(xw,Math.ceil(s/Cp)))}const Rp=s=>Math.ceil(Cp*s*1.35);function _w(s,e=2){const t=o=>Be(`${s}:${o}`),n={stretch:.78+t("stretch")*.5,spin:t("spin")*Math.PI*2,harmonics:[2,3,5].map(o=>({k:o,a:.05+t(`h${o}`)*(o===2?.16:.1),p:t(`hp${o}`)*Math.PI*2})),bays:Array.from({length:1+Math.floor(t("bays")*3)},(o,l)=>({at:t(`bay${l}`)*Math.PI*2,depth:.14+t(`bayd${l}`)*.18,width:.18+t(`bayw${l}`)*.25}))},i=Qh[Math.floor(t("biome")*Qh.length)%Qh.length];let r=390*Math.sqrt(e),a=Pp(s,r,n,i);for(let o=0;o<4;o+=1){const l=a.blocks.reduce((c,h)=>c+h.parcels.length,0);if(l>=Rp(e))break;r*=Math.sqrt(Rp(e)/Math.max(1,l))*1.04,a=Pp(s,r,n,i)}return{...a,scaleTier:e,biome:i}}function Pp(s,e,t,n){const i=O=>Be(`${s}:${O}`),r=i("river")*3,a=O=>{let z=1;for(const X of t.harmonics)z+=X.a*Math.cos(X.k*O+X.p);for(const X of t.bays){const J=Math.atan2(Math.sin(O-X.at),Math.cos(O-X.at));z-=X.depth*Math.exp(-(J*J)/(X.width*X.width))}return z+=fr(Math.cos(O)*2.2,Math.sin(O)*2.2,s+17,3)*.07,Math.max(.45,z)},o=Array.from({length:96},(O,z)=>{const X=z/96*Math.PI*2,J=a(X)*e,fe=Math.cos(X)*J*t.stretch,oe=Math.sin(X)*J/t.stretch;return{x:fe*Math.cos(t.spin)-oe*Math.sin(t.spin),z:fe*Math.sin(t.spin)+oe*Math.cos(t.spin)}}),l=o.reduce((O,z)=>({minX:Math.min(O.minX,z.x),maxX:Math.max(O.maxX,z.x),minZ:Math.min(O.minZ,z.z),maxZ:Math.max(O.maxZ,z.z)}),{minX:1/0,maxX:-1/0,minZ:1/0,maxZ:-1/0}),c=i("hasRiver")<.82,h=(l.maxX-l.minX)/2,d=(l.minX+l.maxX)/2+(i("riverShift")-.5)*h*.5,u=(.04+i("riverAmp")*.07)*e*(i("riverMirror")<.5?-1:1),f=O=>c?d+u*Math.sin(O*.006+r)+.03*e*Math.sin(O*.014):d,m=O=>c?16+4*Math.cos(O*.012)+Jh(l.minZ+(l.maxZ-l.minZ)*.55,l.maxZ,O)*34:-1e6,_=c?Array.from({length:121},(O,z)=>{const X=l.minZ-60+z*((l.maxZ-l.minZ+120)/120);return{x:f(X),z:X}}):[],p=Array.from({length:721},(O,z)=>a(z/720*Math.PI*2)*e),g=Math.min(t.stretch,1/t.stretch)*.92,v=Math.cos(t.spin),M=Math.sin(t.spin),x=(O,z)=>{const X=O*v+z*M,J=-O*M+z*v,fe=X/t.stretch,oe=J*t.stretch;let I=Math.atan2(oe,fe);I<0&&(I+=Math.PI*2);const ae=I/(Math.PI*2)*720,j=Math.floor(ae);return(p[j]+(p[Math.min(720,j+1)]-p[j])*(ae-j)-Math.hypot(fe,oe))*g},w=(O,z)=>Math.min(x(O,z),Math.abs(O-f(z))-m(z)),S=i("hillAngle")*Math.PI*2,A={x:Math.cos(S),z:Math.sin(S)},y=Math.max(...o.map(O=>O.x*A.x+O.z*A.z)),T=y*.6,C=(O,z)=>O*A.x+z*A.z,P=(O,z)=>{const X=w(O,z);if(X<0)return-.65-Math.min(5,-X*.25);const J=Jh(T-10,T+y*.3,C(O,z))*(30+65*fr(O*.012,z*.013,s,4));return Jh(0,10,X)*(1.2+J)},D=(O,z)=>w(O,z)>12&&C(O,z)<T-12,U={height:P,slope:(O,z)=>Math.hypot(P(O+1,z)-P(O-1,z),P(O,z+1)-P(O,z-1))/2,buildable:D,center:{x:0,z:0},radius:e*1.3,coastRadius:()=>e,hasRiver:c};let R={x:d,z:0},B=-1/0;for(let O=0;O<=24;O+=1)for(let z=0;z<=24;z+=1){const X=l.minX+(l.maxX-l.minX)*O/24,J=l.minZ+(l.maxZ-l.minZ)*z/24;if(!D(X,J))continue;const fe=x(X,J),oe=c?Math.abs(Math.abs(X-f(J))-m(J)-70):0,I=-Math.abs(fe-.32*e)-oe*.6-Math.max(0,C(X,J)-T*.4)*.8+i(`core${O}:${z}`)*8;I>B&&(B=I,R={x:X,z:J})}const V=(O,z,X,J,fe)=>{for(let oe=0;oe<=60;oe+=1){const I=Math.max(1,oe*8);for(let ae=0;ae<I;ae+=1){const j=ae/I*Math.PI*2+oe*.37,me={x:O.x+Math.cos(j)*oe*12,z:O.z+Math.sin(j)*oe*12};if(!(w(me.x,me.z)<z||C(me.x,me.z)>T-z*.5)&&!X.some(_e=>Math.hypot(_e.x-me.x,_e.z-me.z)<_e.radius+J+20)&&!(fe&&!fe(me)))return me}}return O},q=(O,z)=>({x:R.x+Math.cos(O)*z,z:R.z+Math.sin(O)*z}),se=i("siteTurn")*Math.PI*2,$=[],ee=(O,z)=>O==="harbor"?24:z+14,ue=(O,z,X,J,fe)=>{const oe=V(X,ee(z,J),$,J);$.push({id:O,kind:z,x:oe.x,z:oe.z,radius:J,yaw:fe})};ue("civic-square","civic",R,44,-.15),ue("observation-tower","tower",q(se+.9,.16*e),26,0),ue("central-station","station",q(se+2.2,.38*e),46,.12),ue("riverside-park","park",c?{x:f(R.z+.18*e)+m(R.z)+60,z:R.z+.18*e}:q(se+3.6,.3*e),47,0),ue("east-stadium","stadium",q(se+4.8,.45*e),49,.2);{const O=[...o].sort((fe,oe)=>Math.hypot(fe.x-R.x,fe.z-R.z)-Math.hypot(oe.x-R.x,oe.z-R.z))[0],z=Math.max(1,Math.hypot(R.x-O.x,R.z-O.z)),X=Math.min(37*.7,z*.5),J={x:O.x+(R.x-O.x)/z*X,z:O.z+(R.z-O.z)/z*X};ue("working-harbor","harbor",J,37,-Math.atan2(O.z-R.z,O.x-R.x))}const ve=[];{const O=[...o].sort((I,ae)=>Math.hypot(I.x-R.x,I.z-R.z)-Math.hypot(ae.x-R.x,ae.z-R.z)),z=(I,ae)=>({x:I.x+(R.x-I.x)*ae,z:I.z+(R.z-I.z)*ae}),X=()=>[...$,...ve].map(I=>({x:I.x,z:I.z,radius:I.radius})),J=[{kind:"tv-tower",weight:2,site:()=>({at:q(se+.4,.14*e),radius:16,clearance:20,yaw:0})},{kind:"twin-towers",weight:1,site:()=>({at:q(se+3.1,.12*e),radius:22,clearance:20,yaw:se})},{kind:"twist-tower",weight:1,site:()=>({at:q(se+2.6,.17*e),radius:16,clearance:20,yaw:0})},{kind:"arch",weight:1,site:()=>({at:q(se+5.6,.26*e),radius:18,clearance:20,yaw:se+5.6})},{kind:"sail-opera",weight:2,site:()=>{const I=O[Math.min(O.length-1,3)];return{at:z(I,.1),radius:34,clearance:16,yaw:-Math.atan2(I.z-R.z,I.x-R.x)}}},{kind:"lighthouse",weight:2,site:()=>{const I=O[O.length-1];return{at:z(I,.04),radius:12,clearance:6,yaw:0}}},{kind:"ferris-wheel",weight:2,site:()=>{const I=O[Math.floor(O.length*.45)];return{at:z(I,.08),radius:26,clearance:14,yaw:-Math.atan2(I.z-R.z,I.x-R.x)+Math.PI/2}}},{kind:"pagoda",weight:n==="eastasian"?5:1,site:()=>({at:{x:A.x*(T-80),z:A.z*(T-80)},radius:18,clearance:18,yaw:S})}],fe=2+(i("landmarkCount")<.5?1:0),oe=[...J];for(let I=0;I<fe&&oe.length;I+=1){const ae=oe.reduce((be,ft)=>be+ft.weight,0);let j=i(`landmark${I}`)*ae,me=0;for(;me<oe.length-1&&j>=oe[me].weight;)j-=oe[me].weight,me+=1;const _e=oe.splice(me,1)[0];if(_e.kind==="twin-towers"||_e.kind==="twist-tower")for(let be=oe.length-1;be>=0;be-=1)(oe[be].kind==="twin-towers"||oe[be].kind==="twist-tower")&&oe.splice(be,1);const de=_e.site();if(!de)continue;const Se=V(de.at,de.clearance,X(),de.radius);ve.push({id:`landmark:${_e.kind}`,kind:_e.kind,x:Se.x,z:Se.z,yaw:de.yaw,radius:de.radius})}}const Me=()=>[...$,...ve],Xe=new Map,Oe=new Map,Ue=O=>({x:Math.round(O.x*100)/100,z:Math.round(O.z*100)/100}),re=(O,z,X,J=!1)=>{const fe=Ue(O),oe=Ue(z),I=jh(fe),ae=jh(oe);if(I===ae)return;const j=[I,ae].sort().join("/");Xe.set(I,{...fe,id:I}),Xe.set(ae,{...oe,id:ae}),Oe.has(j)||Oe.set(j,{id:j,from:I,to:ae,width:X?8:5,kind:X?"arterial":"local",points:[fe,oe],bridge:J})},le=(O,z)=>c&&x(O,z)>0&&Math.abs(O-f(z))<m(z),ye=5+Math.floor(i("trunks")*2),Ne=i("trunkBase")*Math.PI*2,we=[],Ge=[];for(let O=0;O<ye;O+=1){const z=Ne+O/ye*Math.PI*2+(i(`trunkJ${O}`)-.5)*.35,X={x:Math.cos(z),z:Math.sin(z)};if(X.x*A.x+X.z*A.z>Math.cos(40*Math.PI/180))continue;const J=[R];let fe=0;for(let oe=1;oe<400;oe+=1){const I={x:R.x+X.x*oe*12,z:R.z+X.z*oe*12};if(le(I.x,I.z)){if(fe+=12,fe>140)break;continue}if(x(I.x,I.z)<=0||C(I.x,I.z)>=T-12)break;if(fe>0){if(!D(I.x,I.z))continue;const ae=J[J.length-1];Ge.push({from:ae,to:I,angle:Math.atan2(I.z-ae.z,I.x-ae.x),length:Math.hypot(I.x-ae.x,I.z-ae.z)}),re(ae,I,!0,!0),J.push(I),fe=0;continue}oe%3===0&&J.push(I)}if(!(J.length<3)){for(let oe=1;oe<J.length;oe+=1)Ge.some(ae=>ae.to===J[oe])||re(J[oe-1],J[oe],!0);we.push({angle:z,points:J})}}we.sort((O,z)=>O.angle-z.angle);const Et=new pr(we.map(O=>O.points)),qe=.55*e,Ve=[];let tt=[];for(let O=0;O<=96;O+=1){const z=O/96*Math.PI*2,X=qe*(1+.08*fr(Math.cos(z)*1.7,Math.sin(z)*1.7,s+91,2)),J={x:R.x+Math.cos(z)*X,z:R.z+Math.sin(z)*X};x(J.x,J.z)>0&&C(J.x,J.z)<T-12?tt.push(J):(tt.length>=6&&Ve.push(tt),tt=[])}tt.length>=6&&Ve.push(tt);for(let O=Ve.length-1;O>=0;O-=1){const z=Ve[O];if(Math.hypot(z[0].x-z[z.length-1].x,z[0].z-z[z.length-1].z)<.01)continue;const X=fe=>D(fe.x,fe.z);for(;z.length>6&&!X(z[0]);)z.shift();for(;z.length>6&&!X(z[z.length-1]);)z.pop();if(z.length<=6){Ve.splice(O,1);continue}const J=[];for(const fe of[z[0],z[z.length-1]]){const oe=[];for(const I of Oe.values()){if(I.bridge)continue;const[ae,j]=I.points,me=j.x-ae.x,_e=j.z-ae.z,de=Math.max(0,Math.min(1,((fe.x-ae.x)*me+(fe.z-ae.z)*_e)/(me*me+_e*_e||1))),Se=Ue({x:ae.x+de*me,z:ae.z+de*_e}),be=Math.hypot(Se.x-fe.x,Se.z-fe.z),ft=Math.max(1,Math.ceil(be/4));let ct=!0;for(let sn=0;sn<=ft;sn+=1)if(!X({x:fe.x+(Se.x-fe.x)*sn/ft,z:fe.z+(Se.z-fe.z)*sn/ft})){ct=!1;break}ct&&oe.push({p:Se,distance:be})}oe.sort((I,ae)=>I.distance-ae.distance),oe[0]&&J.push(oe[0].p)}if(J.length!==2){Ve.splice(O,1);continue}Ve[O]=[J[0],...z,J[1]].filter((fe,oe,I)=>oe===0||Math.hypot(fe.x-I[oe-1].x,fe.z-I[oe-1].z)>.01);for(const fe of J)for(const oe of[...Oe.values()])oe.bridge||dr(fe,oe.points[0],oe.points[1])>.02||(Oe.delete(oe.id),re(oe.points[0],fe,!0),re(fe,oe.points[1],!0))}for(const O of[...$,...ve]){if(!O.radius||mr(O,O.radius*2,O.radius*2,Ve))continue;const z=[...$,...ve].filter(J=>J!==O).map(J=>({x:J.x,z:J.z,radius:J.radius})),X=V(O,ee(O.kind,O.radius),z,O.radius,J=>mr(J,O.radius*2,O.radius*2,Ve));O.x=X.x,O.z=X.z}const Ye=new pr(Ve),at=O=>Math.hypot(O.x-R.x,O.z-R.z)<.24*e?"downtown":x(O.x,O.z)<90?"waterfront":Et.closerThan(O,60)?"commercial":"residential",yt=[],kt=(O,z,X)=>{const J=((X-z)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)||Math.PI*2,fe=((O-z)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);return fe>0&&fe<J};(we.length?we.map((O,z)=>({lo:O.angle,hi:we[(z+1)%we.length].angle})):[{lo:0,hi:Math.PI*2}]).forEach((O,z)=>{const X=((O.hi-O.lo)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)||Math.PI*2,J=O.lo+X/2,fe={x:Math.cos(J),z:Math.sin(J)},oe={x:-fe.z,z:fe.x},I=44+i(`du${z}`)*10,ae=40+i(`dv${z}`)*12,j=(_e,de)=>({x:R.x+fe.x*_e*I+oe.x*de*ae,z:R.z+fe.z*_e*I+oe.z*de*ae}),me=Math.ceil(e*1.6/Math.min(I,ae));for(let _e=1;_e<me;_e+=1)for(let de=-me;de<me;de+=1){const Se=[j(_e,de),j(_e+1,de),j(_e+1,de+1),j(_e,de+1)],be=j(_e+.5,de+.5),ft=Math.atan2(be.z-R.z,be.x-R.x);if(!kt(ft,O.lo,O.hi)||Se.some(Ct=>!kt(Math.atan2(Ct.z-R.z,Ct.x-R.x),O.lo,O.hi))||Se.some(Ct=>!D(Ct.x,Ct.z))||Se.some((Ct,Yn)=>{const qn=Se[(Yn+1)%4];return!D((Ct.x+qn.x)/2,(Ct.z+qn.z)/2)})||[be,...Se].some(Ct=>Et.closerThan(Ct,10))||[be,...Se].some(Ct=>Ye.closerThan(Ct,9)))continue;const ct=Me().some(Ct=>Ep(Ct,Se)>-Ct.radius),sn=at(be),En=`plan:${z}:${_e}:${de}`,al=[],gu=Math.hypot(Se[1].x-Se[0].x,Se[1].z-Se[0].z),_r=Math.max(3,Math.floor((gu-14)/7.2));for(let Ct=0;Ct<2&&!ct;Ct+=1)for(let Yn=0;Yn<_r;Yn+=1){const qn=Se[Ct===0?0:3],Zn=Se[Ct===0?1:2],Bi=Math.hypot(Zn.x-qn.x,Zn.z-qn.z),Mr=(Zn.x-qn.x)/Bi,yr=(Zn.z-qn.z)/Bi,ys=(Yn+.5)/_r,Ra=Ct===0?12:-12,wi={x:qn.x+Mr*(7+(Bi-14)*ys)-yr*Ra,z:qn.z+yr*(7+(Bi-14)*ys)+Mr*Ra};Ep(wi,Se)<3.6+5||Me().some(Sr=>Math.hypot(wi.x-Sr.x,wi.z-Sr.z)<Sr.radius+9)||mr(wi,7.2,8,Ye)&&al.push({...wi,id:`${En}/${Ct}:${Yn}`,blockId:En,yaw:-Math.atan2(yr,Mr),zone:sn,width:Math.min(7.2,(Bi-14)/_r),depth:8})}const Ca=Ct=>Ue(Ct);yt.push({id:En,districtId:"",...be,width:I,depth:ae,zone:sn,parcels:al,polygon:Se.map(Ca)}),Se.forEach((Ct,Yn)=>re(Ct,Se[(Yn+1)%4],Yn%2===0?de%3===0:_e%3===0))}});{const O=new Map,z=oe=>{let I=oe;for(;O.get(I)!==I;)I=O.get(I);let ae=oe;for(;O.get(ae)!==I;){const j=O.get(ae);O.set(ae,I),ae=j}return I};for(const oe of Xe.keys())O.set(oe,oe);for(const oe of Oe.values()){const I=z(oe.from),ae=z(oe.to);I!==ae&&O.set(I,ae)}const X=jh(Ue(R)),J=we.flatMap(oe=>oe.points.map(I=>Ue(I))),fe=new Map;for(const oe of Xe.values()){const I=z(oe.id),ae=fe.get(I);ae?ae.push(oe):fe.set(I,[oe])}for(const[oe,I]of fe){if(Xe.has(X)&&oe===z(X))continue;let ae=null;for(const j of I)for(const me of J){const _e=Math.hypot(j.x-me.x,j.z-me.z);(!ae||_e<ae.d)&&(ae={a:j,b:me,d:_e})}ae&&ae.d<400&&re(ae.a,ae.b,!1)}}{const z=new Map;for(const X of Oe.values()){const[J,fe]=X.points;for(let oe=Math.floor(Math.min(J.x,fe.x)/60)-1;oe<=Math.floor(Math.max(J.x,fe.x)/60)+1;oe+=1)for(let I=Math.floor(Math.min(J.z,fe.z)/60)-1;I<=Math.floor(Math.max(J.z,fe.z)/60)+1;I+=1){const ae=`${oe}:${I}`,j=z.get(ae);j?j.push(X):z.set(ae,[X])}}for(const X of yt)X.parcels=X.parcels.filter(J=>{const fe=Math.hypot(J.width,J.depth)/2;return(z.get(`${Math.floor(J.x/60)}:${Math.floor(J.z/60)}`)??[]).every(oe=>dr(J,oe.points[0],oe.points[1])>=fe+oe.width/2+.5)})}const dt=[],G=l.maxX-l.minX+120,zt=l.maxZ-l.minZ+120,Ke=60,N=new Map;for(const O of Oe.values()){const[z,X]=O.points;for(let J=Math.floor(Math.min(z.x,X.x)/Ke)-1;J<=Math.floor(Math.max(z.x,X.x)/Ke)+1;J+=1)for(let fe=Math.floor(Math.min(z.z,X.z)/Ke)-1;fe<=Math.floor(Math.max(z.z,X.z)/Ke)+1;fe+=1){const oe=`${J}:${fe}`,I=N.get(oe);I?I.push(O):N.set(oe,[O])}}const b=(O,z)=>Math.hypot(P(O+1,z)-P(O-1,z),P(O,z+1)-P(O,z-1))/2;for(let O=0;O<2600;O+=1){const z=l.minX-60+i(`tx${O}`)*G,X=l.minZ-60+i(`tz${O}`)*zt,J=P(z,X),fe=$.some(j=>j.kind==="park"&&Math.hypot(z-j.x,X-j.z)<j.radius-5),oe=Math.abs(z-f(X))-m(X),I=J>3.2&&J<60&&b(z,X)<1.5,ae=C(z,X)>T-20||x(z,X)<30||I;J<2.5||!fe&&!ae&&!(c&&oe<23)||(N.get(`${Math.floor(z/Ke)}:${Math.floor(X/Ke)}`)??[]).some(j=>dr({x:z,z:X},j.points[0],j.points[1])<j.width/2+3)||dt.push({x:z,z:X,y:P(z,X),seed:i(`tree${O}`)})}const Z=yt.filter((O,z)=>O.parcels.length>0&&z%7===0).map(O=>[...O.polygon,O.polygon[0]]),Q=[],he=[R,q(se+1.6,.42*e),q(se+3.7,.42*e),q(se+5.3,.42*e)];for(const O of he){const z=V(O,40,[...Q,...$.map(X=>({x:X.x,z:X.z,radius:X.radius*.4}))],90);Q.push({...z,radius:90})}const k=Q.map(({x:O,z})=>({x:O,z})),K=Ve,Y={left:l.minX+30,right:l.maxX-30,north:l.minZ+30,south:l.maxZ-30},ie=Math.max(l.maxX-l.minX,l.maxZ-l.minZ)/2+40,xe=Math.ceil((Math.max(Math.abs(l.minX),Math.abs(l.maxX),Math.abs(l.minZ),Math.abs(l.maxZ))+260)*2/100)*100;return{blocks:yt,roadNodes:[...Xe.values()],roadEdges:[...Oe.values()],terrain:U,extent:xe,coast:o,river:_,publicSites:$,parkTrees:dt,urbanBounds:Y,bridges:Ge,boundsRadius:ie,carPaths:Z,districtAnchors:k,highways:K,core:R,islandRadius:e,landmarks:Mw(ve,Ge,i)}}function Mw(s,e,t){if(!e.length||t("suspension")>.55)return s;const n=[...e].sort((i,r)=>r.length-i.length)[0];return[...s,{id:"landmark:suspension-bridge",kind:"suspension-bridge",x:n.from.x,z:n.from.z,to:n.to,yaw:n.angle,radius:0}]}const Ip=45,Lp=["school","mall","hospital"],Dp=new Map;function yw(s,e,t,n,i){const r=t.reduce((c,h)=>c+h.tokensTotal,0),a=Math.max(1,Math.min(9,Math.round(t.length/36)));new Set(n.map(c=>c.id));const o=Math.ceil(t.length/a),l=[];for(let c=0;c<a;c+=1){const h=Be(`${s}:mass:${c}`)*Math.PI*2;let d=null;for(let u=6;u<=26&&!d;u+=2){const f=60+u*9,m=e.x+Math.cos(h)*f,_=e.z+Math.sin(h)*f;i.terrain.buildable(m,_)&&mr({x:m,z:_},30,30,i.highways)&&(i.blocks.some(p=>p.parcels.length>0&&Math.hypot(p.x-m,p.z-_)<46)||l.some(p=>Math.hypot(p.x-m,p.z-_)<34)||(d={x:m,z:_}))}d&&l.push({districtId:s,x:d.x,z:d.z,y:Math.max(.3,i.terrain.height(d.x,d.z)),count:c===a-1?t.length-o*(a-1):o,tokens:Math.round(r/a),height:9+Be(`${s}:mh:${c}`)*8})}return l}function Sw(s,e,t=1927){const n=vw(s.buildings.length),i=`${t}:${n}`;let r=Dp.get(i);r||(r=_w(t,n),Dp.set(i,r));const a=r.blocks.flatMap(U=>U.parcels),o=new Map(a.map(U=>[U.id,U])),l=new Map,c=new Set;if((e==null?void 0:e.seed)===t&&e.scaleTier!==n&&e.islandRadius>0){const U=r.islandRadius/e.islandRadius,R=new Map(e.districts.flatMap(se=>[...se.slots])),B=40,V=new Map;for(const se of a){const $=`${Math.floor(se.x/B)}:${Math.floor(se.z/B)}`,ee=V.get($);ee?ee.push(se):V.set($,[se])}const q=[...s.buildings].filter(se=>R.has(se.id)).sort((se,$)=>se.startedAt-$.startedAt||se.id.localeCompare($.id));for(const se of q){const $=R.get(se.id),ee=$.x*U,ue=$.z*U,ve=Math.floor(ee/B),Me=Math.floor(ue/B);let Xe=null,Oe=1/0;for(let Ue=0;Ue<=3&&!Xe;Ue+=1)for(let re=ve-Ue;re<=ve+Ue;re+=1)for(let le=Me-Ue;le<=Me+Ue;le+=1)if(Math.max(Math.abs(re-ve),Math.abs(le-Me))===Ue)for(const ye of V.get(`${re}:${le}`)??[]){if(c.has(ye.id))continue;const Ne=Math.hypot(ye.x-ee,ye.z-ue);Ne<Oe&&(Oe=Ne,Xe=ye)}Xe&&Oe<=120&&(l.set(se.id,Xe),c.add(Xe.id))}}if((e==null?void 0:e.seed)===t&&e.scaleTier===n){const U=new Map(e.districts.flatMap(R=>[...R.slots]));for(const R of s.buildings){const B=U.get(R.id);B&&o.has(B.id)&&!c.has(B.id)&&(l.set(R.id,o.get(B.id)),c.add(B.id))}}const h=[...s.districts].sort((U,R)=>R.sessionCount-U.sessionCount||(U.id<R.id?-1:1)).filter(U=>s.buildings.some(R=>R.districtId===U.id)),d=new Map(h.map(U=>[U.id,s.buildings.filter(R=>R.districtId===U.id).length])),u=[...d.values()].reduce((U,R)=>U+R,0)||1,f=r.core,m=Be(`${t}:wedge`)*Math.PI*2,_=U=>((Math.atan2(U.z-f.z,U.x-f.x)-m)%(Math.PI*2)+Math.PI*2)%(Math.PI*2),p=r.blocks.filter(U=>U.parcels.length>0).sort((U,R)=>_(U)-_(R)||U.id.localeCompare(R.id)),g=p.reduce((U,R)=>U+R.parcels.length,0),v=new Map;{let U=0,R=0,B=0;for(const V of h)for(B+=d.get(V.id)/u*g;U<p.length&&(R<B||V===h[h.length-1]);)v.set(p[U].id,V.id),R+=p[U].parcels.length,U+=1}const M=U=>p.filter(R=>v.get(R.id)===U),x=new Map;for(const U of h){const R=M(U.id).sort((V,q)=>Math.hypot(V.x-f.x,V.z-f.z)-Math.hypot(q.x-f.x,q.z-f.z)),B=R[Math.min(R.length-1,Math.floor(R.length*.3))];x.set(U.id,B?{x:B.x,z:B.z}:f)}const w=[];for(const U of h){const R=x.get(U.id),B=M(U.id).filter(V=>V.parcels.every(q=>!c.has(q.id))&&mr(V,V.width,V.depth,r.highways)).sort((V,q)=>Math.hypot(V.x-R.x,V.z-R.z)-Math.hypot(q.x-R.x,q.z-R.z)||V.id.localeCompare(q.id))[0];if(B){for(const V of B.parcels)c.add(V.id);w.push({id:`garden:${U.id}`,districtId:U.id,blockId:B.id,x:B.x,z:B.z,y:r.terrain.height(B.x,B.z),yaw:B.parcels[0].yaw,width:B.width,depth:B.depth,seed:Be(`garden:${U.id}`)})}}const S=s.buildings.filter(U=>!l.has(U.id)),A=[];for(const U of h){const R=x.get(U.id),B=S.filter(ee=>ee.districtId===U.id).sort((ee,ue)=>ee.startedAt-ue.startedAt||ue.height-ee.height||ee.id.localeCompare(ue.id));if(!B.length)continue;const V=ee=>Math.hypot(ee.x-R.x,ee.z-R.z)+Be(ee.id)*6,q=M(U.id).flatMap(ee=>ee.parcels).filter(ee=>!c.has(ee.id)).sort((ee,ue)=>V(ee)-V(ue)||ee.id.localeCompare(ue.id)),se=[];let $=0;for(const ee of B){for(;$<q.length&&c.has(q[$].id);)$+=1;let ue=q[$];if(ue?$+=1:ue=a.filter(ve=>!c.has(ve.id)).sort((ve,Me)=>V(ve)-V(Me)||ve.id.localeCompare(Me.id))[0],!ue){se.push(ee);continue}l.set(ee.id,ue),c.add(ue.id)}se.length&&A.push(...yw(U.id,R,se,a,r))}const y=ww(s,a,c,l,e??null,r),T=s.districts.map((U,R)=>{const B=s.buildings.filter(ve=>ve.districtId===U.id&&l.has(ve.id)),V=new Map(B.map(ve=>[ve.id,l.get(ve.id)])),q=[...V.values()],se=q.length?{x:q.reduce((ve,Me)=>ve+Me.x,0)/q.length,z:q.reduce((ve,Me)=>ve+Me.z,0)/q.length}:{x:0,z:0},$=q[0]??{x:-160,z:-100},ee=r.publicSites.filter(ve=>ve.kind==="civic"||ve.kind==="park"||ve.kind==="station").sort((ve,Me)=>Math.hypot(ve.x-se.x,ve.z-se.z)-Math.hypot(Me.x-se.x,Me.z-se.z))[0],ue=ee?{x:ee.x,z:ee.z,y:Math.max(.4,r.terrain.height(ee.x,ee.z))}:{...$,y:3};return{id:U.id,label:U.label,center:se,radius:Math.max(30,...q.map(ve=>Math.hypot(ve.x-se.x,ve.z-se.z))),terrain:r.terrain,slots:V,grounds:new Map(q.map((ve,Me)=>[B[Me].id,r.terrain.height(ve.x,ve.z)])),roads:[],carPaths:R===0?r.carPaths:[],river:r.river,riverHalfWidth:18,trees:[],plaza:ue,anomaly:U.anomaly?{severity:U.anomaly.severity,count:U.anomaly.count}:null,sessionCount:U.sessionCount}}),C=bw(r.coast),P=[1.24,1.36,1.5].map((U,R)=>{const B=r.coast.map(V=>({x:C.x+(V.x-C.x)*U,z:C.z+(V.z-C.z)*U}));return[...B,B[0]]}),D=[{center:{x:C.x+980,z:C.z-320},radius:120,height:88,seed:71},{center:{x:C.x-1020,z:C.z+260},radius:150,height:108,seed:37}];return{...r,districts:T,seed:t,massing:A,civics:y,gardens:w,boatLanes:[],decorMountains:[],boatLoops:P,seaMountains:D}}function ww(s,e,t,n,i,r){const a=s.buildings.length,o=a===0?0:Math.max(2,Math.min(30,Math.floor(a/Ip)));if(!o)return[];const l=s.buildings.map(M=>M.startedAt).sort((M,x)=>M-x),c=s.districts.map(M=>({id:M.id,n:s.buildings.filter(x=>x.districtId===M.id).length})).filter(M=>M.n>0),h=c.reduce((M,x)=>M+x.n,0)||1,d=c.map(M=>({id:M.id,exact:M.n/h*o,take:Math.floor(M.n/h*o)}));let u=o-d.reduce((M,x)=>M+x.take,0);[...d].sort((M,x)=>x.exact-x.take-(M.exact-M.take)||(M.id<x.id?-1:1)).forEach(M=>{u>0&&(M.take+=1,u-=1)});const f=[];for(let M=0;f.length<o;M+=1)for(const x of[...d].sort((w,S)=>S.take-w.take||(w.id<S.id?-1:1)))M<x.take&&f.push(x.id);const m=r.blocks.filter(M=>M.parcels.length>0&&M.parcels.every(x=>!t.has(x.id))&&mr(M,M.width,M.depth,r.highways)).map(M=>({id:M.id,x:M.x,z:M.z,yaw:M.parcels[0].yaw,width:M.width,depth:M.depth,zone:M.zone})),_=new Set,p=[],g=new Map(((i==null?void 0:i.civics)??[]).map(M=>[M.id,M])),v=new Map;return f.forEach((M,x)=>{const w=g.get(`civic:${x}`);w&&m.some(S=>S.id===w.parcelId)&&v.set(w.parcelId,`civic:${x}`)}),f.forEach((M,x)=>{var P;const w=`civic:${x}`,S=Lp[x%Lp.length],A=l[Math.min(l.length-1,(x+1)*Ip-1)]??l[l.length-1],y=g.get(w);let T=y&&v.get(y.parcelId)===w?m.find(D=>D.id===y.parcelId&&!_.has(D.id)):void 0;const C=T&&y?y.districtId:M;if(!T){const D=s.buildings.filter(V=>V.districtId===M).map(V=>n.get(V.id)).filter(V=>!!V);if(!D.length)return;const U=D.reduce((V,q)=>V+q.x,0)/D.length,R=D.reduce((V,q)=>V+q.z,0)/D.length,B={school:["residential"],mall:["downtown","commercial","waterfront"],hospital:["downtown","commercial","residential"]};T=(P=m.filter(V=>!_.has(V.id)&&!v.has(V.id)&&p.every(q=>Math.hypot(q.x-V.x,q.z-V.z)>=60)).map(V=>{const q=Math.min(150,...p.map(ee=>Math.hypot(ee.x-V.x,ee.z-V.z))),se=B[S].indexOf(V.zone),$=se<0?60:se*15;return{p:V,d:Math.hypot(V.x-U,V.z-R)*.35-q*.7+$+Be(`${w}:${V.id}`)*10}}).sort((V,q)=>V.d-q.d||V.p.id.localeCompare(q.p.id))[0])==null?void 0:P.p}T&&(_.add(T.id),p.push({id:w,kind:S,districtId:C,parcelId:T.id,x:T.x,z:T.z,y:r.terrain.height(T.x,T.z),yaw:T.yaw,width:T.width,depth:T.depth,unlockAt:A}))}),p}function bw(s){let e=0,t=0;for(const n of s)e+=n.x,t+=n.z;return{x:e/s.length,z:t/s.length}}function Tw(s){const e=new Map;for(const l of s)for(const c of[l.from,l.to]){const h=e.get(c)??[];h.push(l),e.set(c,h)}const t=new Set([...e].filter(([,l])=>l.length>=3).map(([l])=>l)),n=new Set,i=[],r=(l,c)=>{const h=e.get(c);if(h.length===2)return h.find(d=>d!==l&&!d.bridge&&d.width===l.width&&d.kind===l.kind)},a=(l,c)=>{const h=[];let d=l,u=c;for(;!n.has(d.id);){n.add(d.id);const f=d.from===u?d.points:[...d.points].reverse();h.push(...h.length?f.slice(1):f),u=d.from===u?d.to:d.from;const m=r(d,u);if(!m||n.has(m.id))break;d=m}i.push({width:l.width,kind:l.kind,points:h,from:c,to:u})},o=s.filter(l=>!l.bridge);for(const l of o)n.has(l.id)||(r(l,l.from)?r(l,l.to)||a(l,l.to):a(l,l.from));for(const l of o)n.has(l.id)||a(l,l.from);return{runs:i,junctions:t}}function gr(s=1,e=1){if(typeof document>"u")return new OffscreenCanvas(s,e);const t=document.createElement("canvas");return t.width=s,t.height=e,t}function eu(s){const e=s.getContext("2d");if(!e)throw new Error("canvas 2d context unavailable");return e}function Aa(s){const e=xt();return e.harnesses[s]??e.fallback}function xr(s,e){const t=gr(s,Math.max(1,e)),n=eu(t);return{canvas:t,ctx:n}}function Aw(){const{canvas:e,ctx:t}=xr(256,256);t.fillStyle="#fbf8f2",t.fillRect(0,0,256,256);for(let i=0;i<2;i+=1){const r=i*128;t.fillStyle="#5f8d96",t.beginPath(),t.roundRect(22,r+44,212,40,14),t.fill(),t.fillStyle="rgba(255, 255, 255, 0.28)",t.fillRect(30,r+50,196,6);for(let a=1;a<6;a+=1)t.fillStyle="#e9e3d8",t.fillRect(22+a*(212/6)-2,r+44,4,40);for(let a=0;a<3;a+=1)t.fillStyle="#ffffff",t.fillRect(0,r+98+a*7,256,3),t.fillStyle="rgba(90, 80, 70, 0.22)",t.fillRect(0,r+101+a*7,256,2)}t.fillStyle="#f3eee6",t.fillRect(256/2-12,0,24,256),t.fillStyle="rgba(90, 80, 70, 0.18)",t.fillRect(256/2+12,0,3,256);const n=new Ft(e);return n.wrapS=n.wrapT=bn,n.anisotropy=4,n.needsUpdate=!0,n}function tu(s,e){const{canvas:t,ctx:n}=xr(128,128);if(n.fillStyle="#f4f1ea",n.fillRect(0,0,128,128),s===0){for(let r=0;r<4;r+=1)for(let a=0;a<5;a+=1){const o=Be(`w${e}:${r}:${a}`)>.86;n.fillStyle=o?"#f7e3ae":"#4f5d6a",n.fillRect(4+a*24,5+r*32,20,24)}n.fillStyle="rgba(120, 108, 92, 0.14)";for(let r=0;r<4;r+=1)n.fillRect(0,r*32+28,128,2)}else if(s===1)for(let r=0;r<4;r+=1){n.fillStyle="#4d5c68",n.fillRect(0,r*32+3,128,25),n.fillStyle="#e9e5d8";for(let a=0;a<4;a+=1)n.fillRect(a*32,r*32+3,2,25);Be(`b${e}:${r}`)>.8&&(n.fillStyle="#f3dfa6",n.fillRect(34+r%2*32,r*32+3,30,25))}else{n.fillStyle="#45586a",n.fillRect(0,0,128,128);for(let r=0;r<4;r+=1)for(let a=0;a<4;a+=1){const o=Be(`g${e}:${r}:${a}`);o>.93?(n.fillStyle="#f2dfae",n.fillRect(a*32+1,r*32+2,31,29)):(n.fillStyle=`rgba(${o>.5?"70,92,110":"58,76,94"}, 1)`,n.fillRect(a*32+1,r*32+2,31,29))}n.fillStyle="#c9d0d3";for(let r=0;r<4;r+=1)n.fillRect(0,r*32,128,2);for(let r=0;r<4;r+=1)n.fillRect(r*32,0,1,128)}const i=new Ft(t);return i.wrapS=i.wrapT=bn,i.anisotropy=4,i.needsUpdate=!0,i}function nu(s,e,t,n){e.length&&(s.beginPath(),e.forEach((i,r)=>{const[a,o]=t(i.x,i.z);r===0?s.moveTo(a,o):s.lineTo(a,o)}),s.stroke())}function Ew(s){const{canvas:t,ctx:n}=xr(2048,2048),i=2048/s.extent,r=(v,M)=>[(v+s.extent/2)*i,(M+s.extent/2)*i],a=xr(384,384),o=a.ctx.createImageData(384,384),l=zy(xt(),s.biome),c=v=>`#${v.map(M=>Math.max(0,Math.min(255,Math.round(M))).toString(16).padStart(2,"0")).join("")}`,h=(v,M,x)=>v.map((w,S)=>w+(M[S]-w)*x),d=c(h([197,192,179],l.sand,.45)),u=c(h([145,165,127],l.lawn,.6));for(let v=0;v<384;v+=1)for(let M=0;M<384;M+=1){const x=(M/383-.5)*s.extent,w=(v/383-.5)*s.extent,S=s.terrain.height(x,w),A=Be(`ground:${M}:${v}`)*7,y=l,T=S<0?y.sea:S<2.5?y.sand:S<9?y.lawn:S<35?y.grass:y.rock,C=(v*384+M)*4;o.data[C]=T[0]+A,o.data[C+1]=T[1]+A,o.data[C+2]=T[2]+A,o.data[C+3]=255}a.ctx.putImageData(o,0,0),n.drawImage(a.canvas,0,0,2048,2048);const f=(v,M)=>{n.beginPath(),v.forEach((x,w)=>{const[S,A]=r(x.x,x.z);w===0?n.moveTo(S,A):n.lineTo(S,A)}),n.closePath(),n.fillStyle=M,n.fill()},m=(v,M,x,w,S,A)=>{const[y,T]=r(v,M);n.save(),n.translate(y,T),n.rotate(-S),n.fillStyle=A,n.fillRect(-x*i/2,-w*i/2,x*i,w*i),n.restore()};for(const v of s.blocks){f(v.polygon.map(M=>({x:v.x+(M.x-v.x)*.88,z:v.z+(M.z-v.z)*.88})),v.parcels.length?d:u);for(const M of v.parcels)m(M.x,M.z,M.width-.3,M.depth-.3,M.yaw,"#bcb8ac")}const{runs:_,junctions:p}=Tw(s.roadEdges);n.lineCap="butt",n.lineJoin="round";for(const v of _)n.strokeStyle="#d4cfc2",n.lineWidth=(v.width+2.4)*i,nu(n,v.points,r);for(const v of _)n.strokeStyle=v.kind==="arterial"?"#505b60":"#646c6b",n.lineWidth=v.width*i,nu(n,v.points,r);for(const v of s.roadNodes)if(p.has(v.id)){const M=s.roadEdges.filter(A=>A.from===v.id||A.to===v.id),x=Math.max(...M.map(A=>A.width)),[w,S]=r(v.x,v.z);n.fillStyle=M.some(A=>A.kind==="arterial")?"#505b60":"#646c6b",n.beginPath(),n.arc(w,S,x*i/2,0,Math.PI*2),n.fill()}for(const v of _){const M=v.points[0],x=v.points[v.points.length-1],w=v.points[1],S=v.points[v.points.length-2],A=Math.hypot(w.x-M.x,w.z-M.z),y=Math.hypot(x.x-S.x,x.z-S.z),T=p.has(v.from)?6:0,C=p.has(v.to)?6:0;if(A<=T||y<=C)continue;const P=[{x:M.x+(w.x-M.x)*T/A,z:M.z+(w.z-M.z)*T/A},...v.points.slice(1,-1),{x:x.x-(x.x-S.x)*C/y,z:x.z-(x.z-S.z)*C/y}];n.strokeStyle=v.kind==="arterial"?"#d6c998":"#b6bdba",n.lineWidth=.22*i,n.setLineDash([3*i,3*i]),nu(n,P,r),n.setLineDash([])}for(const v of s.roadEdges){if(v.bridge)continue;const[M,x]=v.points,w=Math.hypot(x.x-M.x,x.z-M.z);if(w<14)continue;const S=(x.x-M.x)/w,A=(x.z-M.z)/w;for(const y of[M,x])if(p.has(y===M?v.from:v.to))for(let T=-2;T<=2;T+=1){const C=y===M?1:-1;m(y.x+S*6.5*C-A*T*.8,y.z+A*6.5*C+S*T*.8,1.4,.4,-Math.atan2(A,S),"#dbd8cb")}}for(const v of s.publicSites){const[M,x]=r(v.x,v.z);if(v.kind==="park")n.fillStyle="#799b71",n.beginPath(),n.ellipse(M,x,v.radius*i,v.radius*.75*i,-.2,0,Math.PI*2),n.fill(),n.strokeStyle="#d2c4a0",n.lineWidth=2.2*i,n.beginPath(),n.ellipse(M,x,v.radius*.75*i,v.radius*.55*i,-.2,0,Math.PI*2),n.stroke();else{if(m(v.x,v.z,v.radius*1.6,v.radius*1.3,v.yaw,v.kind==="harbor"?"#999f98":"#d0c7b3"),v.kind==="civic"&&(n.fillStyle="#609ca3",n.beginPath(),n.arc(M,x+18*i,6*i,0,Math.PI*2),n.fill(),n.strokeStyle="#efdfbd",n.lineWidth=2*i,n.stroke()),v.kind==="station")for(let w=0;w<4;w+=1)m(v.x-18+w*8,v.z,1.2,v.radius*1.15,v.yaw,"#737c76");v.kind==="stadium"&&(n.fillStyle="#647f62",n.beginPath(),n.ellipse(M,x,28*i,19*i,-v.yaw,0,Math.PI*2),n.fill(),n.strokeStyle="#dad9c0",n.lineWidth=.7*i,n.strokeRect(M-18*i,x-10*i,36*i,20*i))}}const g=new Hc(t);return g.anisotropy=8,g}function Cw(s,e,t){const r=xr(4,4);r.ctx.font="600 46px system-ui, -apple-system, sans-serif";const a=r.ctx.measureText(s).width;r.ctx.font=`400 ${46*.62}px system-ui, -apple-system, sans-serif`;const o=r.ctx.measureText(e).width,l=Math.ceil(Math.max(a,o))+36,c=Math.ceil(46*2.1),{canvas:h,ctx:d}=xr(l,c),u=18;d.beginPath(),d.roundRect(1,1,l-2,c-2,u),d.fillStyle="rgba(250, 250, 248, 0.92)",d.fill(),d.strokeStyle="rgba(90, 84, 74, 0.28)",d.lineWidth=2,d.stroke(),d.fillStyle="#292d34",d.font="600 46px system-ui, -apple-system, sans-serif",d.fillText(s,18,54),d.fillStyle=t,d.beginPath(),d.arc(25,46*1.62,7,0,Math.PI*2),d.fill(),d.fillStyle="#63748a",d.font=`400 ${46*.62}px system-ui, -apple-system, sans-serif`,d.fillText(e,40,46*1.62+46*.24);const f=new Ft(h);return f.needsUpdate=!0,{texture:f,aspect:l/c}}const nn=new mt(1,1,1).translate(0,.5,0),iu=new fn(1,1,1,14).translate(0,.5,0),Up=8.2,Ea=.9,su=10.5,Rw=90;function ru(s,e){const t=[0];for(let r=1;r<s.length;r+=1)t.push(t[r-1]+Math.hypot(s[r].x-s[r-1].x,s[r].z-s[r-1].z));const n=t[t.length-1]||1,i=Math.hypot(s[0].x-s[s.length-1].x,s[0].z-s[s.length-1].z)<.01;return s.map((r,a)=>{if(i)return Up;const o=Math.min(t[a],n-t[a]),l=Math.min(1,o/Rw),c=l*l*(3-2*l),h=Math.max(0,e(r.x,r.z))+.3-Ea;return h+(Up-h)*c})}const Pw=[[5,4],[1,4],[4,4],[1,2]];function il(s){const e=new ht({color:"#ffffff"});return e.onBeforeCompile=t=>{t.fragmentShader=t.fragmentShader.replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * ${s.toFixed(3)};`)},e.customProgramCacheKey=()=>`city-self-lit-${s.toFixed(3)}`,e}function Iw(s,e,t){const n=new ht({map:s});return n.onBeforeCompile=i=>{Object.assign(i.uniforms,e),i.vertexShader=i.vertexShader.replace("#include <common>",`#include <common>
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
#include <opaque_fragment>`)},n.customProgramCacheKey=()=>`city-facade-${t}`,n}function Np(s){const e=[0];let t=0;for(let n=1;n<s.length;n+=1)t+=Math.hypot(s[n].x-s[n-1].x,s[n].z-s[n-1].z),e.push(t);return{cumulative:e,total:t}}function zp(s,e){const t=(e%s.total+s.total)%s.total;let n=1;for(;n<s.cumulative.length-1&&s.cumulative[n]<t;)n+=1;const i=s.points[n-1],r=s.points[n],a=s.cumulative[n]-s.cumulative[n-1]||1,o=(t-s.cumulative[n-1])/a;return{x:i.x+(r.x-i.x)*o,z:i.z+(r.z-i.z)*o,dx:(r.x-i.x)/a,dz:(r.z-i.z)/a}}const au=new WeakMap,ou=new WeakMap;function Fp(s){return ou.has(s)||ou.set(s,s.speed),ou.get(s)}function Ji(s,e){return au.has(s)||au.set(s,e),au.get(s)}function Lw(s,e,t){const n=s/1.39,i=e/n,r=[new pe(0*n,.88*n),new pe(.06*n,.88*n),new pe(.09*n,.94*n),new pe(.12*n,.98*n),new pe(.18*n,1*n),new pe(.24*n,.98*n)],a=24;for(let u=1;u<=a;u+=1){const f=u/a;r.push(new pe(.24*n+Math.pow(f,1.6)*1.15*n,(1-f)*.98*n))}const o=new Jc(r.reverse(),32),l=o.attributes.position,c=(u,f,m,_)=>(fr(u+m*.71,f+m*1.37,t+77,_)+fr(m+f*.53,u-f*.91,t+131,_))*.25+.5,h=n;for(let u=0;u<l.count;u+=1){const f=l.getX(u),m=l.getY(u),_=l.getZ(u);if(Math.hypot(f,_)<.001){l.setY(u,m*i);continue}const g=m/h,v=(c(f/n*4,m/n*4,_/n*4,4)-.5)*2,M=Math.sin(g*Math.PI),x=1+v*.25*Math.max(M,(1-g)*.6);l.setX(u,f*x),l.setZ(u,_*x),l.setY(u,(m+v*.08*n*M)*i)}const d=new Float32Array(l.count*3);for(let u=0;u<l.count;u+=1){const f=l.getX(u),m=l.getY(u)/i,_=l.getZ(u),p=Math.hypot(f,_),g=Math.max(0,m/h),v=c(f/n*10,m/n*10,_/n*10,3),M=Math.max(0,Math.min(1,g+(v-.5)*.25));let x;if(M>.88&&p<.1*n)x=[.85,.25,.05];else if(M>.82)x=[.16,.1,.08];else if(M>.55){const S=(M-.55)/.27;x=[.38+(.16-.38)*S,.24+(.1-.24)*S,.18+(.08-.18)*S]}else{const S=Math.min(1,M/.55);x=[.28+.1*S,.32-.08*S,.22-.04*S]}const w=(v-.5)*.1;d[u*3]=Math.max(0,Math.min(1,x[0]+w)),d[u*3+1]=Math.max(0,Math.min(1,x[1]+w)),d[u*3+2]=Math.max(0,Math.min(1,x[2]+w))}return o.setAttribute("color",new Ot(d,3)),o.computeVertexNormals(),o}let An=null;class Dw{constructor(e,t,n=null){F(this,"group",new Xt);F(this,"raycastTargets",[]);F(this,"water");F(this,"runtimes",[]);F(this,"runtimeById",new Map);F(this,"shaftMeshes",[]);F(this,"zoneById",new Map);F(this,"shaftIdByInstance",[]);F(this,"disposables",[]);F(this,"podiumMesh");F(this,"roofMesh");F(this,"facadeUniforms",[]);F(this,"decoTrimMesh");F(this,"roofProfiles",[]);F(this,"gardenTreeMesh");F(this,"civicPieces",[]);F(this,"civicMeshes",[]);F(this,"civicProgress",[]);F(this,"civicTarget",[]);F(this,"heroParts",null);F(this,"decoCornerMesh");F(this,"nightLights",null);F(this,"terrainUniforms",null);F(this,"flagTime",null);F(this,"waterAssetUniforms",null);F(this,"neonMesh");F(this,"scaffoldMesh");F(this,"antennaMesh");F(this,"beaconMesh");F(this,"craneMastMesh");F(this,"craneArmMesh");F(this,"treeMesh");F(this,"floraMeshes",[]);F(this,"landmarkSpinners",[]);F(this,"carMesh");F(this,"carKeep",1);F(this,"boatMesh");F(this,"wakeMesh");F(this,"wakes");F(this,"cloudMesh");F(this,"anomalyMarkers",[]);F(this,"labels",[]);F(this,"hoverRing");F(this,"selectRing");F(this,"cars");F(this,"boats");F(this,"clouds");F(this,"waterUniforms");F(this,"matrix",new De);F(this,"quaternion",new Jt);F(this,"euler",new kn);F(this,"scaleVector",new L);F(this,"positionVector",new L);F(this,"color",new ge);F(this,"cursor",Number.NaN);F(this,"live",!0);F(this,"labelsVisible",!0);F(this,"previousDisplays",null);F(this,"hoveredId",null);F(this,"selectedId",null);F(this,"nightGlow",0);this.model=e,this.layout=t,this.previousDisplays=n;const i=e.buildings.length;let r=An&&An.seed===t.seed&&An.layout.scaleTier===t.scaleTier&&An.layout.highways===t.highways&&JSON.stringify([An.layout.civics,An.layout.gardens])===JSON.stringify([t.civics,t.gardens])?An:null;if(!r){An==null||An.disposables.forEach(g=>g.dispose());const f=[];this.disposables=f,this.buildTerrain(),this.buildInfrastructure(),this.buildDistrictExpressways(),this.nightLights=this.buildNightLights(),this.buildPublicSites(),this.buildCivics(),this.buildLandmarks(),this.buildSeaMountains(),this.treeMesh=this.buildTrees();const m=this.buildCars();this.carMesh=m.mesh;const _=this.buildBoats();this.boatMesh=_.mesh,this.wakeMesh=_.wakeMesh,this.wakes=_.wakes;const p=this.buildClouds();this.cloudMesh=p.mesh,this.water=this.buildWater(),this.buildGardens(),this.buildFlags(),r={seed:t.seed,layout:t,group:this.group,disposables:f,water:this.water,treeMesh:this.treeMesh,carMesh:this.carMesh,cars:m.cars,boatMesh:this.boatMesh,boats:_.boats,wakeMesh:this.wakeMesh,wakes:_.wakes,cloudMesh:this.cloudMesh,clouds:p.clouds,terrainUniforms:this.terrainUniforms,flagTime:this.flagTime,waterAssetUniforms:this.waterAssetUniforms,landmarkSpinners:this.landmarkSpinners,nightLights:this.nightLights},An=r,this.group=new Xt,this.disposables=[]}this.group.add(r.group),this.water=r.water,this.treeMesh=r.treeMesh,this.carMesh=r.carMesh,this.boatMesh=r.boatMesh,this.cloudMesh=r.cloudMesh,this.cars=r.cars,this.boats=r.boats,this.clouds=r.clouds,this.wakeMesh=r.wakeMesh,this.wakes=r.wakes,this.terrainUniforms=r.terrainUniforms,this.flagTime=r.flagTime,this.waterAssetUniforms=r.waterAssetUniforms,this.landmarkSpinners=r.landmarkSpinners,this.nightLights=r.nightLights,this.captureAnimationOrigin(),this.waterUniforms=this.water.material.uniforms;const a=[tu(0,11),tu(1,37),tu(2,71),Aw()];a.forEach(f=>{f.colorSpace=Wt,this.disposables.push(f)});const o=new Map;for(const f of this.layout.districts)for(const[m,_]of f.slots)o.set(m,_.zone);this.zoneById=o;const l=[0,0,0,0];for(const f of e.buildings)o.has(f.id)&&(l[this.facadeFor(f)]+=f.archetype==="tower"||f.archetype==="landmark"?2:1);a.forEach((f,m)=>{const _=l[m]+8,p=nn.clone();p.setAttribute("aFloors",new os(new Float32Array(_),1));const g={uRows:{value:m===3?2:4},uPhoto:{value:0},uPhotoTex:{value:null},uPhotoRows:{value:1},uTileWidth:{value:1},uSelfLit:{value:.24},uWindowGlow:{value:0},uGrid:{value:new pe(...Pw[m]??[4,4])},uEnv:{value:null},uEnvStrength:{value:0},uGradeTop:{value:new ge(xt().skyGrade.top)},uGradeHorizon:{value:new ge(xt().skyGrade.horizon)},uGradeAmount:{value:xt().skyGrade.amount},uSkyYaw:{value:_h(xt())}};this.facadeUniforms.push(g);const v=new Vt(p,Iw(f,g,String(m)),_);v.instanceMatrix.setUsage(Hi),v.castShadow=!0,v.receiveShadow=!0,v.count=0,v.frustumCulled=!1,v.name=`city-shafts-${m}`,this.shaftMeshes.push(v),this.shaftIdByInstance.push(new Map),this.group.add(v),this.raycastTargets.push(v),this.disposables.push(p,v.material)});const c=nn.clone();{const f=c.getAttribute("position");for(let m=0;m<f.count;m+=1)f.getY(m)>.99&&f.setX(m,0);c.computeVertexNormals()}const h=new Gn(.5,1,4,1).rotateY(Math.PI/4).translate(0,.5,0);[c,h,nn,nn].forEach((f,m)=>{const _=this.makeInstanced(f,il(.18),i);_.castShadow=!0,_.name=`city-roof-profile-${m+1}`,this.roofProfiles.push(_)}),this.gardenTreeMesh=this.makeInstanced(new aa(1,0).translate(0,1,0),new ht({color:xt().foliage}),i*3),this.gardenTreeMesh.castShadow=!0;const u=l[3]+4;this.decoTrimMesh=this.makeInstanced(nn,il(.24),u*2),this.decoCornerMesh=this.makeInstanced(iu,il(.24),u),this.podiumMesh=this.makeInstanced(nn,new ht({color:"#e8e2d5"}),i),this.roofMesh=this.makeInstanced(nn,new ht({color:"#ffffff"}),i),this.neonMesh=this.makeInstanced(nn,new Dt({color:"#ffffff",toneMapped:!1}),i),this.neonMesh.castShadow=!1,this.scaffoldMesh=this.makeInstanced(nn,new ht({color:"#e0a83f",transparent:!0,opacity:.24,depthWrite:!1}),i),this.scaffoldMesh.castShadow=!1,this.antennaMesh=this.makeInstanced(new fn(.09,.16,1,5).translate(0,.5,0),new ht({color:"#5d6470"}),96),this.beaconMesh=this.makeInstanced(new Dn(.32,8,6),new Dt({color:"#ffb02e"}),96),this.craneMastMesh=this.makeInstanced(new mt(.85,1,.85).translate(0,.5,0),new ht({color:"#ffb400",emissive:"#6b4300"}),48),this.craneArmMesh=this.makeInstanced(new mt(1,.32,.32),new ht({color:"#ffb400",emissive:"#6b4300"}),48),this.buildMassing(),this.buildAnomalyMarkers(),this.hoverRing=this.makeGroundRing("#087f62"),this.selectRing=this.makeGroundRing("#c96f4a"),this.buildRuntimes(),this.buildLabels()}makeInstanced(e,t,n){const i=new Vt(e,t,Math.max(n,1));return i.instanceMatrix.setUsage(Hi),i.count=0,i.frustumCulled=!1,this.group.add(i),this.disposables.push(e,t),i}makeGroundRing(e){const t=new oa(.86,1,40).rotateX(-Math.PI/2),n=new Dt({color:e,transparent:!0,opacity:.85,depthWrite:!1}),i=new $e(t,n);return i.visible=!1,i.renderOrder=3,this.group.add(i),this.disposables.push(t,n),i}buildTerrain(){{const e=this.layout.extent,t=192,n=new ni(e,e,t,t).rotateX(-Math.PI/2),i=n.attributes.position;for(let l=0;l<i.count;l+=1){const c=i.getX(l),h=i.getZ(l);i.setXYZ(l,c,this.layout.terrain.height(c,h),h)}n.computeVertexNormals();const r=Ew(this.layout);r.colorSpace=Wt;const a=new ht({map:r});this.installGroundDetail(a);const o=new $e(n,a);o.receiveShadow=!0,this.group.add(o),this.disposables.push(n,a,r)}}installGroundDetail(e){const t={uDetail:{value:0}};for(const n of["Asphalt","Concrete","Sand","Mud","Grass"])t[`u${n}C`]={value:null},t[`u${n}N`]={value:null},t[`u${n}Mean`]={value:new L(.5,.5,.5)};this.terrainUniforms=t,e.onBeforeCompile=n=>{Object.assign(n.uniforms,t),n.vertexShader=n.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vCityWorld;`).replace("#include <project_vertex>",`#include <project_vertex>
vCityWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);const i=["Asphalt","Concrete","Sand","Mud","Grass"].map(r=>`uniform sampler2D u${r}C; uniform sampler2D u${r}N; uniform vec3 u${r}Mean;`).join(`
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
#endif`)},e.customProgramCacheKey=()=>"city-terrain-detail"}setMirror(e,t){this.waterAssetUniforms&&(this.waterAssetUniforms.uMirror.value=e,this.waterAssetUniforms.uHasMirror.value=e?1:0,t&&this.waterAssetUniforms.uMirrorMatrix.value.copy(t))}setNightWater(e){this.waterAssetUniforms&&(this.waterAssetUniforms.uNight.value=e)}setSkyMix(e){const t=xt().skyGrade.amount*(1-e);this.waterAssetUniforms&&(this.waterAssetUniforms.uGradeAmount.value=t);for(const n of this.facadeUniforms)n.uGradeAmount.value=t}applyAssets(e){var l;const t=c=>{const h=c.image,d=gr();d.width=d.height=8;const u=d.getContext("2d");if(!u)return new L(.5,.5,.5);u.drawImage(h,0,0,8,8);const f=u.getImageData(0,0,8,8).data,m=[0,0,0];for(let p=0;p<f.length;p+=4)for(let g=0;g<3;g+=1)m[g]+=f[p+g];const _=p=>Math.pow(p/255/64,2.2);return new L(_(m[0]),_(m[1]),_(m[2]))};if(this.terrainUniforms){const c=e.ground,h=[["Asphalt",c.asphalt],["Concrete",c.concrete],["Sand",c.sand],["Mud",c.mud],["Grass",c.grass]];for(const[d,u]of h)this.terrainUniforms[`u${d}C`].value=u.color,this.terrainUniforms[`u${d}N`].value=u.normal,this.terrainUniforms[`u${d}Mean`].value=t(u.color);this.terrainUniforms.uDetail.value=1}const n=[8,10,10],i=[30,32,32];e.facades.forEach((c,h)=>{const d=this.facadeUniforms[h];d&&(d.uPhotoTex.value=c,d.uPhoto.value=1,d.uPhotoRows.value=n[h],d.uTileWidth.value=i[h])});const r=[.3,.7,.9,.3],a=e.sky.day;this.facadeUniforms.forEach((c,h)=>{c.uEnv.value=a,c.uEnvStrength.value=r[h]??0});const o=(l=this.shaftMeshes[3])==null?void 0:l.material;o&&(o.normalMap=e.stuccoNormal,o.normalScale.set(.6,.6),o.needsUpdate=!0),this.waterAssetUniforms&&(this.waterAssetUniforms.uNormal.value=e.waterNormal,this.waterAssetUniforms.uSkyTex.value=e.sky.day,this.waterAssetUniforms.uHasAssets.value=1)}buildInfrastructure(){const e=[],t=(i,r,a,o,l,c,h,d=0,u=0)=>e.push({x:i,y:r,z:a,sx:o,sy:l,sz:c,color:h,tilt:d,yaw:u});for(const i of this.layout.roadEdges){if(i.bridge){const[_,p]=i.points,g=Math.hypot(p.x-_.x,p.z-_.z),v=-Math.atan2(p.z-_.z,p.x-_.x),M=(_.x+p.x)/2,x=(_.z+p.z)/2,w=Math.max(this.layout.terrain.height(_.x,_.z),this.layout.terrain.height(p.x,p.z));t(M,w-.4,x,g+.5,.4,i.width,"#6a7071",0,v);for(const S of[-1,1]){const A=S*(i.width/2-.15);t(M+Math.sin(v)*A,w,x+Math.cos(v)*A,g,.65,.3,"#b9bcb2",0,v);const y=S*(i.width/2-.65);t(M+Math.sin(v)*y,w+.015,x+Math.cos(v)*y,g,.025,.12,"#e4dfc9",0,v)}for(let S=2;S<g-1;S+=6){const A=(S+1)/g;t(_.x+(p.x-_.x)*A,w+.015,_.z+(p.z-_.z)*A,Math.min(2,g-S),.025,.14,"#dfd1a5",0,v)}for(let S=16;S<g-12;S+=32){const A=S/g,y=_.x+(p.x-_.x)*A,T=_.z+(p.z-_.z)*A,C=this.layout.terrain.height(y,T);t(y,C,T,1.6,Math.max(.1,w-.35-C),i.width-.6,"#a9aaa0",0,v)}continue}const[r,a]=i.points,o=Math.hypot(a.x-r.x,a.z-r.z);if(o<14)continue;const l=o-11,c=-Math.atan2(a.z-r.z,a.x-r.x),h=-(a.z-r.z)/o,d=(a.x-r.x)/o,u=(r.x+a.x)/2,f=(r.z+a.z)/2,m=Math.max(0,this.layout.terrain.height(u,f));for(const _ of[-1,1]){const p=_*(i.width/2+.25);t(u+h*p,m+.02,f+d*p,l,.18,.35,"#cbc6ba",0,c)}}const n=this.makeInstanced(nn,new ht({color:"#ffffff"}),e.length);e.forEach((i,r)=>{this.positionVector.set(i.x,i.y,i.z),this.euler.set(i.tilt??0,i.yaw??0,0),this.quaternion.setFromEuler(this.euler),this.scaleVector.set(i.sx,i.sy,i.sz),this.matrix.compose(this.positionVector,this.quaternion,this.scaleVector),n.setMatrixAt(r,this.matrix),n.setColorAt(r,this.color.set(i.color))}),n.instanceMatrix.needsUpdate=!0,n.instanceColor&&(n.instanceColor.needsUpdate=!0),n.count=e.length,n.name="city-infrastructure-decorative"}buildDistrictExpressways(){const e=[];for(const i of this.layout.highways??[]){const r=ru(i,(l,c)=>this.layout.terrain.height(l,c));let a=0,o=0;for(let l=0;l<i.length;l+=1){const c=i[l];if(l>0&&(a+=Math.hypot(c.x-i[l-1].x,c.z-i[l-1].z)),a>=o){o=a+34;const h=Math.max(-3,this.layout.terrain.height(c.x,c.z)),d=r[l]+.05;if(d-h<1.5)continue;const u=i[Math.min(l+1,i.length-1)],f=i[Math.max(l-1,0)],m=-Math.atan2(u.z-f.z,u.x-f.x);e.push({x:c.x,y:h,z:c.z,sx:1.8,sy:d-h,sz:8.4,yaw:m,color:"#a9aaa0"})}}for(let l=1;l<i.length;l+=1){const c=i[l-1],h=i[l],d=Math.hypot(h.x-c.x,h.z-c.z);if(d<6)continue;const u=-Math.atan2(h.z-c.z,h.x-c.x),f=(c.x+h.x)/2,m=(c.z+h.z)/2,_=r[l-1],p=r[l],g=(_+p)/2,v=Math.atan2(p-_,d),M=Math.hypot(d,p-_),x=g+Ea;e.push({x:f,y:g,z:m,sx:M+.5,sy:Ea,sz:su,yaw:u,pitch:v,color:"#6a7071"});const w=Math.sin(u),S=Math.cos(u);for(const A of[-3.6,0,3.6])e.push({x:f+w*A,y:x,z:m+S*A,sx:M,sy:.05,sz:.3,yaw:u,pitch:v,color:"#c6c6bb"});for(const A of[-5.1,5.1])e.push({x:f+w*A,y:x,z:m+S*A,sx:M,sy:.55,sz:.3,yaw:u,pitch:v,color:"#b9bcb2"})}}if(!e.length)return;const t=nn.clone(),n=new Vt(t,new ht({color:"#ffffff"}),e.length);n.castShadow=!0,n.receiveShadow=!0,e.forEach((i,r)=>{this.positionVector.set(i.x,i.y,i.z),this.euler.set(0,i.yaw,i.pitch??0,"YZX"),this.quaternion.setFromEuler(this.euler),this.euler.set(0,0,0,"XYZ"),this.scaleVector.set(i.sx,i.sy,i.sz),this.matrix.compose(this.positionVector,this.quaternion,this.scaleVector),n.setMatrixAt(r,this.matrix),n.setColorAt(r,this.color.set(i.color))}),n.instanceMatrix.needsUpdate=!0,n.instanceColor&&(n.instanceColor.needsUpdate=!0),n.name="city-district-expressways",this.group.add(n),this.disposables.push(t,n.material)}buildPublicSites(){var a;const e=[],t=[],n=[];for(const o of this.layout.publicSites){if(o.kind==="park")continue;const l=o.radius,c=Math.max(0,this.layout.terrain.height(o.x,o.z)),h=Math.cos(o.yaw),d=Math.sin(o.yaw),u=(p,g)=>({x:o.x+p*h+g*d,z:o.z-p*d+g*h}),f=(p,g,v,M,x,w,S,A=0)=>{const y=u(p,v);e.push({x:y.x,y:c+g,z:y.z,sx:M,sy:x,sz:w,yaw:o.yaw+A,color:S})},m=(p,g,v,M,x,w)=>{const S=u(p,v);t.push({x:S.x,y:c+g,z:S.z,sx:M,sy:x,sz:M,yaw:0,color:w})},_=(p,g,v,M,x,w,S,A=0)=>{const y=u(p,v);n.push({x:y.x,y:c+g,z:y.z,sx:M,sy:x,sz:w,yaw:o.yaw+A,color:S})};if(o.kind==="civic"){f(0,0,0,l*1.2,1.6,l*.9,"#e4dcc8"),f(0,1.6,0,l*.9,9,l*.55,"#efe7d6");for(let p=-3;p<=3;p+=1)m(p*l*.12,1.6,l*.34,.75,9,"#f6f0e2");f(0,10.6,0,l*.98,1.1,l*.62,"#cdbf9f"),m(0,11.7,0,l*.27,4.2,"#d6c9a8"),m(0,15.9,0,l*.2,3.4,"#5fa7a3"),m(0,19.3,0,.4,6,"#c9b98f");for(const p of[-1,1])_(0,11.7,p*l*.31,l*.98,.22,.22,"#ffe2a8");for(const p of[-1,1])_(p*l*.49,11.7,0,.22,.22,l*.62,"#ffe2a8");_(0,1.7,l*.46,l*1.2,.2,.2,"#ffd08a"),_(0,17.4,0,l*.41,.25,l*.41,"#46e6ff"),_(0,25.6,0,.6,.9,.6,"#ff5a7a")}else if(o.kind==="station"){f(0,0,0,l*1.5,.7,l*1.1,"#cfc7b3");for(const p of[-18,-10,-2,6])f(p,.7,0,.5,.15,l*1.1,"#6f7773");f(0,7.4,0,l*1.4,.55,l*.9,"#8e9a9c");for(const p of[-l*.6,0,l*.6])for(const g of[-l*.38,l*.38])m(p,.7,g,.55,6.7,"#a9b0b0");f(0,0,-l*.62,l*1.3,11,7,"#d9cdb5"),m(l*.5,11,-l*.62,1.6,10,"#c8bba0"),m(l*.5,21,-l*.62,2.1,1.2,"#f4efe0"),_(l*.5,21.15,-l*.62,1.7,.9,1.7,"#fff3cf");for(const p of[-1,1])_(0,7.5,p*l*.45,l*1.4,.22,.22,"#58e0ff");_(0,11,-l*.62+3.6,l*1.3,.22,.22,"#ffd08a")}else if(o.kind==="stadium"){for(let g=0;g<18;g+=1){const v=g/18*Math.PI*2,M=Math.cos(v)*27,x=Math.sin(v)*19.5,w=Math.atan2(19.5*Math.cos(v),-27*Math.sin(v));f(M,0,x,10.5,g%4===0?11:8,5.5,g%4===0?"#c05a4f":"#dcd8ca",-w)}for(const[g,v]of[[-30,-22],[30,-22],[-30,22],[30,22]])m(g,0,v,.55,24,"#9aa0a0"),_(g,24,v,4,1.4,2.4,"#fff3c4");for(let g=0;g<18;g+=1){const v=g/18*Math.PI*2,M=Math.atan2(19.5*Math.cos(v),-27*Math.sin(v));_(Math.cos(v)*27,g%4===0?11.1:8.1,Math.sin(v)*19.5,10.5,.22,.22,g%2===0?"#38e8ff":"#ff4fd8",-M)}}else if(o.kind==="tower")m(0,0,0,6.5,3.2,"#c4c7c6"),m(0,3.2,0,2.3,42,"#cfd3d6"),m(0,42,0,6.4,3.8,"#eaf0f2"),m(0,45.8,0,4.2,2.2,"#7fb4c2"),m(0,48,0,.45,15,"#d45a4a"),_(0,45.2,0,4.4,.35,4.4,"#46e6ff"),_(0,41.6,0,6.6,.3,6.6,"#ff4fd8"),_(0,20,0,2.5,.35,2.5,"#ffd08a"),_(0,62.6,0,1.1,1.3,1.1,"#ff3b3b");else if(o.kind==="harbor"){f(0,0,0,l*1.5,.5,l*1.2,"#8e9490"),f(0,.5,-l*.5,l*1.1,6.5,10,"#bab4a3");const p=["#a9684f","#4f7f8a","#c9a24a","#6a8a62","#8a5a7a","#d8d2c0"];for(let g=0;g<5;g+=1)for(let v=0;v<3;v+=1){const M=1+Math.floor(Be(`ctn:${o.id}:${g}:${v}`)*3);for(let x=0;x<M;x+=1)f(-l*.55+g*7,.5+x*2.7,-l*.1+v*4.4,6.2,2.6,3.8,p[Math.floor(Be(`ctc:${o.id}:${g}:${v}:${x}`)*p.length)])}for(const[g,v]of[[-l*.65,l*.38],[-l*.65,l*.62],[l*.15,l*.38],[l*.15,l*.62]])m(g,.5,v,.6,17,"#c9532f");f(-l*.25,17.5,l*.5,l*1.1,1.3,1.5,"#c9532f"),f(-l*.25+l*.55,17.2,l*.5,14,1,1,"#d9d3c2",0),_(0,.55,l*.6,l*1.5,.25,.25,"#ffb366"),_(0,.55,-l*.6,l*1.5,.25,.25,"#ffb366");for(const[g,v]of[[-l*.65,l*.38],[-l*.65,l*.62],[l*.15,l*.38],[l*.15,l*.62]])_(g,17.6,v,1.4,.7,1.4,"#fff1c4");_(-l*.25+l*.55+7,17.2,l*.5,.9,.9,.9,"#ff3b3b");for(const g of[-l*.6,0,l*.6])m(g,.5,-l*.2,.18,12,"#8a9096"),_(g,12.5,-l*.2,1.6,.5,1.6,"#fff1c4")}}if(!e.length)return;const i=(o,l,c)=>{if(!l.length)return;const h=new ht({color:"#ffffff"}),d=new Vt(o.clone(),h,l.length);d.castShadow=!0,d.receiveShadow=!0,l.forEach((u,f)=>{this.positionVector.set(u.x,u.y,u.z),this.euler.set(0,u.yaw,0),this.quaternion.setFromEuler(this.euler),this.scaleVector.set(u.sx,u.sy,u.sz),this.matrix.compose(this.positionVector,this.quaternion,this.scaleVector),d.setMatrixAt(f,this.matrix),d.setColorAt(f,this.color.set(u.color))}),d.instanceMatrix.needsUpdate=!0,d.instanceColor&&(d.instanceColor.needsUpdate=!0),d.name=c,this.group.add(d),this.disposables.push(d.geometry,h)};i(nn,e,"city-public-sites-boxes"),i(iu,t,"city-public-sites-cylinders");const r=(a=this.nightLights)==null?void 0:a.neon;if(r&&n.length){const o=new Vt(nn.clone(),r,n.length);n.forEach((l,c)=>{this.positionVector.set(l.x,l.y,l.z),this.euler.set(0,l.yaw,0),this.quaternion.setFromEuler(this.euler),this.scaleVector.set(l.sx,l.sy,l.sz),this.matrix.compose(this.positionVector,this.quaternion,this.scaleVector),o.setMatrixAt(c,this.matrix),o.setColorAt(c,this.color.set(l.color))}),o.instanceMatrix.needsUpdate=!0,o.instanceColor&&(o.instanceColor.needsUpdate=!0),o.frustumCulled=!1,o.name="city-public-sites-glow",this.group.add(o),this.disposables.push(o.geometry)}}buildFlags(){const e=[];for(const u of this.layout.gardens??[]){const f=Math.cos(u.yaw),m=Math.sin(u.yaw);e.push({x:u.x+f*u.width*.3-m*u.depth*.32,z:u.z+m*u.width*.3+f*u.depth*.32,y:u.y,yaw:u.yaw,pole:7.5,cloth:1,color:Aa(u.districtId).accent})}const t=this.layout.publicSites.find(u=>u.kind==="tower");if(t&&e.push({x:t.x,z:t.z,y:this.layout.terrain.height(t.x,t.z),yaw:t.yaw,pole:15,cloth:1.5,color:"#f2efe6"}),!e.length)return;this.flagTime={value:0};const n=new fn(.12,.17,1,6).translate(0,.5,0),i=new ht({color:"#8a9096"}),r=this.makeInstanced(n,i,e.length),a=5.2,o=new ni(a,3.1,10,5).translate(a/2+.1,-1.7,0),l=new Float32Array(e.map((u,f)=>Be(`flag:${f}`)*Math.PI*2));o.setAttribute("aPhase",new os(l,1));const c=new ht({side:rn}),h=this.flagTime;c.onBeforeCompile=u=>{u.uniforms.uTime=h,u.vertexShader=u.vertexShader.replace("#include <common>",`#include <common>
attribute float aPhase;
uniform float uTime;`).replace("#include <begin_vertex>",`#include <begin_vertex>
          float hoist = smoothstep(0.0, ${a.toFixed(1)}, position.x);
          transformed.z += (sin(uTime * 2.7 + aPhase + position.x * 1.1) * 0.4 + sin(uTime * 5.2 + aPhase * 1.7 + position.x * 2.4) * 0.13) * hoist;
          transformed.y -= hoist * hoist * 0.2;`)},c.customProgramCacheKey=()=>"city-flag-cloth";const d=new Vt(o,c,e.length);d.name="city-flags",e.forEach((u,f)=>{this.compose(u.x,u.y,u.z,u.yaw,.8,u.pole,.8),r.setMatrixAt(f,this.matrix),this.compose(u.x,u.y+u.pole-.15,u.z,u.yaw,u.cloth,u.cloth,1),d.setMatrixAt(f,this.matrix),d.setColorAt(f,this.color.set(u.color))}),d.instanceColor&&(d.instanceColor.needsUpdate=!0),this.group.add(r,d),this.disposables.push(n,i,o,c)}buildGardens(){const e=this.layout.gardens??[];if(!e.length)return;const t=[],n=[],i=[],r=[],a=this.water.material;for(const l of e){const c=l.seed,h=Math.max(.3,l.y),d=Math.cos(l.yaw),u=Math.sin(l.yaw),f=(C,P)=>({x:l.x+C*d+P*u,z:l.z-C*u+P*d}),m=l.width-3,_=l.depth-3,p=f(0,0);t.push({x:p.x,y:h,z:p.z,sx:m,sy:.25,sz:_,yaw:l.yaw,tilt:0,color:"#7fae6a"});const g=-m*.08,v=_*.04,M=m*.32,x=_*.3,w=f(g,v),S=new $e(new Jr(1,40).rotateX(-Math.PI/2),a);S.position.set(w.x,h+.3,w.z),S.rotation.y=l.yaw,S.scale.set(M,1,x),S.renderOrder=1,this.group.add(S),this.disposables.push(S.geometry);for(let C=0;C<22;C+=1){const P=C/22*Math.PI*2,D=Be(`${l.id}:bank:${C}`),U=f(g+Math.cos(P)*(M+.6),v+Math.sin(P)*(x+.6)),R=.9+D*.9;n.push({x:U.x,y:h+.2,z:U.z,sx:R*1.3,sy:R*.55,sz:R,yaw:D*6.28,tilt:0,color:D>.5?"#a8a59c":"#8f8c84"})}const A=f(g+M*.35,v-x*.25);for(let C=0;C<7;C+=1){const P=Be(`${l.id}:rock:${C}`),D=C<3?0:C<5?1:C<6?2:3,U=(3.2-D*.7)*(.8+P*.4),R=(P-.5)*2.4;n.push({x:A.x+R,y:h+.1+D*2.1,z:A.z+(Be(`${l.id}:rz:${C}`)-.5)*2.4,sx:U,sy:U*(1.1+P*.5),sz:U*.85,yaw:P*6.28,tilt:(P-.5)*.4,color:["#9b978c","#b3afa4","#86837b"][C%3]})}const y=f(m*.34,-_*.18),T=new ge(Aa(l.districtId).accent).lerp(new ge("#5a3b2c"),.35).getStyle();t.push({x:y.x,y:h+.25,z:y.z,sx:5.4,sy:.5,sz:5.4,yaw:l.yaw,tilt:0,color:"#d8d1c2"});for(const[C,P]of[[-2,-2],[2,-2],[-2,2],[2,2]]){const D=f(m*.34+C,-_*.18+P);t.push({x:D.x,y:h+.75,z:D.z,sx:.35,sy:3.4,sz:.35,yaw:l.yaw,tilt:0,color:"#8a3b2e"})}i.push({x:y.x,y:h+4.1,z:y.z,sx:4.4,sy:2.6,sz:4.4,yaw:l.yaw+Math.PI/4,tilt:0,color:T});for(let C=0;C<14;C+=1){const P=C/14*Math.PI*2+c,D=f(Math.cos(P)*m*.44,Math.sin(P)*_*.42),U=1.4+Be(`${l.id}:tree:${C}`)*.9;r.push({x:D.x,y:h+.2,z:D.z,sx:U,sy:U*1.2,sz:U,yaw:0,tilt:0,color:C%3===0?"#5f9a55":"#6fae63"})}}const o=(l,c,h)=>{if(!c.length)return;const d=new ht({color:"#ffffff",flatShading:!0}),u=new Vt(l,d,c.length);u.castShadow=!0,u.receiveShadow=!0,c.forEach((f,m)=>{this.positionVector.set(f.x,f.y,f.z),this.euler.set(f.tilt,f.yaw,0),this.quaternion.setFromEuler(this.euler),this.scaleVector.set(f.sx,f.sy,f.sz),this.matrix.compose(this.positionVector,this.quaternion,this.scaleVector),u.setMatrixAt(m,this.matrix),u.setColorAt(m,this.color.set(f.color))}),u.instanceMatrix.needsUpdate=!0,u.instanceColor&&(u.instanceColor.needsUpdate=!0),u.name=h,this.group.add(u),this.disposables.push(l,d)};o(nn.clone(),t,"city-garden-boxes"),o(new Mo(.6,0).translate(0,.45,0),n,"city-garden-rocks"),o(new Gn(.5,1,4).translate(0,.5,0),i,"city-garden-roofs"),o(new aa(1,0).translate(0,1.4,0),r,"city-garden-trees")}buildNightLights(){const e=new Dt({color:"#ffc773",toneMapped:!1}),t=gr();t.width=t.height=64;const n=t.getContext("2d");if(n){const p=n.createRadialGradient(32,32,0,32,32,32);p.addColorStop(0,"rgba(255,255,255,1)"),p.addColorStop(.35,"rgba(255,255,255,0.45)"),p.addColorStop(1,"rgba(255,255,255,0)"),n.fillStyle=p,n.fillRect(0,0,64,64)}const i=new Hc(t),r=new Dt({color:"#ff9e4d",map:i,transparent:!0,depthWrite:!1,blending:Jn,toneMapped:!1});this.disposables.push(i),r.visible=!1;const a=new Dt({color:"#ffb366",toneMapped:!1}),o=new Dt({color:"#ffffff",toneMapped:!1}),l=this.makeInstanced(new fn(.1,.14,1,5).translate(0,.5,0),new ht({color:"#59636a"}),4600),c=this.makeInstanced(new mt(.5,.22,.9),e,4600),h=this.makeInstanced(new Jr(1,14).rotateX(-Math.PI/2),r,4600);h.renderOrder=2;const d=this.makeInstanced(nn,a,2200),u=30;let f=0;const m=(p,g,v,M,x,w,S=3.2,A=9.5)=>{f>=4600||(this.compose(p,x,g,0,1,4.6,1),l.setMatrixAt(f,this.matrix),this.compose(p-v*.45,x+4.55,g-M*.45,w,1,1,1),c.setMatrixAt(f,this.matrix),this.compose(p-v*S,x+.12,g-M*S,0,A,1,A),h.setMatrixAt(f,this.matrix),f+=1)};for(const p of this.layout.roadEdges){if(p.bridge||p.kind!=="arterial")continue;const[g,v]=p.points,M=Math.hypot(v.x-g.x,v.z-g.z);if(M<18)continue;const x=(v.x-g.x)/M,w=(v.z-g.z)/M,S=-w,A=x,y=-Math.atan2(w,x),T=Math.max(1,Math.floor(M/u));for(let C=0;C<T;C+=1){const P=(C+.5)/T*M,D=C%2===0?1:-1,U=g.x+x*P+S*D*(p.width/2+.9),R=g.z+w*P+A*D*(p.width/2+.9);m(U,R,S*D,A*D,Math.max(0,this.layout.terrain.height(U,R)),y)}}for(const p of this.layout.publicSites){if(p.kind!=="park")continue;const g=Math.max(10,p.radius*.7);for(let v=0;v<8;v+=1){const M=v/8*Math.PI*2,x=Math.cos(M),w=Math.sin(M),S=p.x+x*g,A=p.z+w*g;m(S,A,x,w,Math.max(0,this.layout.terrain.height(S,A)),-Math.atan2(x,-w)+Math.PI/2)}}for(const p of this.layout.highways??[]){const g=ru(p,(M,x)=>this.layout.terrain.height(M,x));let v=0;for(let M=1;M<p.length;M+=1){const x=p[M-1],w=p[M],S=Math.hypot(w.x-x.x,w.z-x.z);if(S<1)continue;const A=(w.x-x.x)/S,y=(w.z-x.z)/S,T=-Math.atan2(y,A);for(let C=14-v;C<S;C+=34){const P=Math.floor((C+S*.37+x.x)/34)%2===0?1:-1,D=g[M-1]+(g[M]-g[M-1])*(C/S)+Ea;m(x.x+A*C-y*P*5.1,x.z+y*C+A*P*5.1,-y*P,A*P,D,T,5.1,su/2-.3)}v=(S-(14-v))%34}}l.count=f,c.count=f,h.count=f;for(const p of[l,c,h])p.instanceMatrix.needsUpdate=!0,p.frustumCulled=!1;let _=0;for(const p of this.layout.highways??[]){const g=ru(p,(v,M)=>this.layout.terrain.height(v,M));for(let v=1;v<p.length&&_<2190;v+=1){const M=p[v-1],x=p[v],w=Math.hypot(x.x-M.x,x.z-M.z);if(w<6||Math.abs(g[v]-g[v-1])>.15)continue;const S=-Math.atan2(x.z-M.z,x.x-M.x),A=Math.sin(S),y=Math.cos(S);for(const T of[-5.1,5.1])this.compose((M.x+x.x)/2+A*T,(g[v]+g[v-1])/2+Ea+.35,(M.z+x.z)/2+y*T,S,w,.14,.14),d.setMatrixAt(_,this.matrix),_+=1}}return d.count=_,d.instanceMatrix.needsUpdate=!0,d.frustumCulled=!1,this.disposables.push(e,r,a,o),{heads:e,pools:r,strips:a,neon:o}}buildLandmarks(){const e=this.layout.landmarks??[];if(!e.length)return;const n=Math.max(30,...this.model.buildings.map(c=>c.height))*.9,i=(c,h=0)=>{const d=new ht({color:c,emissive:new ge(c).multiplyScalar(h)});return this.disposables.push(d),d},r=(c,h,d,u,f,m,_=0)=>{const p=new $e(c,h);return p.position.set(u,f,m),p.rotation.y=_,p.castShadow=!0,p.receiveShadow=!0,d.add(p),this.disposables.push(c),p},a=i("#f3f1ea"),o=i("#c9cfd3"),l=i("#c8473a");for(const c of e){const h=new Xt,d=Math.max(.3,this.layout.terrain.height(c.x,c.z));if(h.position.set(c.x,d,c.z),h.rotation.y=c.yaw,c.kind==="tv-tower"){const u=Math.min(n,70);r(new fn(1.6,3.2,u*.78,12).translate(0,u*.39,0),o,h,0,0,0),r(new Dn(5.5,18,12).scale(1,.55,1),a,h,0,u*.72,0),r(new la(6.2,.5,6,32).rotateX(Math.PI/2),i("#7fb4c2",.8),h,0,u*.72,0),r(new fn(.25,.45,u*.24,6).translate(0,u*.12,0),l,h,0,u*.78,0)}else if(c.kind==="twin-towers"){const u=Math.min(n,62);for(const f of[-1,1])r(new mt(8,u,8).translate(0,u/2,0),i("#9fb3c0"),h,f*9,0,0),r(new Gn(3,10,8).translate(0,5,0),o,h,f*9,u,0);r(new mt(10,2.4,3).translate(0,1.2,0),o,h,0,u*.55,0)}else if(c.kind==="twist-tower"){const u=Math.min(n,66),f=22;for(let m=0;m<f;m+=1)r(new mt(9,u/f*.92,9).translate(0,u/f*.46,0),i(m%2?"#a9c3cf":"#93aebb"),h,0,m*u/f,0,m/f*Math.PI*.5)}else if(c.kind==="arch"){const u=Math.min(n,26);for(const f of[-1,1])r(new mt(5,u,7).translate(0,u/2,0),a,h,f*8,0,0);r(new mt(21,6,7.4).translate(0,3,0),a,h,0,u,0),r(new mt(22,1,8).translate(0,.5,0),i("#d9d3c2"),h,0,u+6,0)}else if(c.kind==="sail-opera"){r(new mt(46,3,26).translate(0,1.5,0),i("#d9d3c2"),h,0,0,0);const u=new ht({color:"#f6f4ee",side:rn});this.disposables.push(u);const f=4;for(let m=0;m<f;m+=1){const _=13-m*2,p=new Dn(_,20,12,Math.PI/2,Math.PI,0,Math.PI/2).scale(.75,1.6,.9),g=r(p,u,h,-15+m*9.5,3,0,0);g.rotation.z=-.18}}else if(c.kind==="lighthouse"){const u=Math.min(n,32),f=6;for(let m=0;m<f;m+=1){const _=3.4-m/f*1.4,p=3.4-(m+1)/f*1.4;r(new fn(p,_,u/f,14).translate(0,u/f/2,0),m%2?l:a,h,0,m*u/f,0)}r(new fn(2.2,2.2,3,10).translate(0,1.5,0),i("#fff2c0",1.5),h,0,u,0),r(new Gn(2.8,3,10).translate(0,1.5,0),l,h,0,u+3,0);{const m=new Dt({color:new ge("#fff2c0").multiplyScalar(1.6),transparent:!0,opacity:.08,depthWrite:!1,blending:Jn,toneMapped:!1});this.disposables.push(m);const _=new Xt;_.position.set(0,u+1.5,0);for(const p of[-1,1]){const g=new $e(new Gn(7,160,16,1,!0).translate(0,-90,0).rotateZ(p*Math.PI/2),m);this.disposables.push(g.geometry),_.add(g)}h.add(_),this.landmarkSpinners.push({object:_,axis:"y",speed:.9})}}else if(c.kind==="ferris-wheel"){const u=Math.min(n*.45,20);for(const p of[-1,1])r(new mt(1,u+4,1).translate(0,(u+4)/2,0),o,h,-4,0,p*3).rotation.z=p*.18,r(new mt(1,u+4,1).translate(0,(u+4)/2,0),o,h,4,0,p*3).rotation.z=-p*.18;const f=new Xt;f.position.set(0,u+4,0);const m=new $e(new la(u,.45,6,48),i("#e8eef0",.6));this.disposables.push(m.geometry),f.add(m);const _=16;for(let p=0;p<_;p+=1){const g=p/_*Math.PI*2,v=new $e(new mt(.25,u,.25).translate(0,u/2,0),o);v.rotation.z=g,this.disposables.push(v.geometry),f.add(v);const M=new $e(new mt(2,2,2),i(["#ff6f61","#ffd166","#06d6a0","#118ab2"][p%4],.5));M.position.set(Math.cos(g)*u,Math.sin(g)*u,0),this.disposables.push(M.geometry),f.add(M)}h.add(f),this.landmarkSpinners.push({object:f,axis:"z",speed:.08})}else if(c.kind==="pagoda"){let f=0;r(new mt(16,2,16).translate(0,1,0),i("#d9d3c2"),h,0,0,0),f=2;const m=i("#3d5a4f"),_=i("#b5463a");for(let p=0;p<7;p+=1){const g=10-p*1.1;r(new mt(g,3.6,g).translate(0,1.8,0),_,h,0,f,0),r(new Gn(g*.95,1.6,4).rotateY(Math.PI/4).translate(0,.8,0),m,h,0,f+3.6,0),f+=4.4}r(new fn(.2,.35,6,6).translate(0,3,0),i("#c9a24a"),h,0,f,0)}else if(c.kind==="suspension-bridge"&&c.to){h.position.set(c.x,0,c.z),h.rotation.y=-Math.atan2(c.to.z-c.z,c.to.x-c.x);const u=Math.hypot(c.to.x-c.x,c.to.z-c.z),f=Math.max(.3,this.layout.terrain.height(c.x,c.z),this.layout.terrain.height(c.to.x,c.to.z)),m=34,_=f+m-1,p=u*.18,g=u*.82,v=(p+g)/2,M=f+9,x=i("#c8473a");for(const y of[p,g]){for(const T of[-1,1])r(new mt(1.6,m,1.6).translate(0,m/2,0),x,h,y,f,T*5.5);r(new mt(1.6,1.6,12.6).translate(0,.8,0),x,h,y,f+m-4,0)}const w=this.nightLights,S=[],A=y=>{if(y<p)return f+1+y/Math.max(1,p)*(_-f-1);if(y>g)return f+1+(u-y)/Math.max(1,u-g)*(_-f-1);const T=(y-v)/((g-p)/2);return M+(_-M)*T*T};for(const y of[-1,1]){const T=[];for(let P=0;P<=40;P+=1){const D=P/40*u;T.push(new L(D,A(D),y*5.5))}const C=new $e(new eh(new yo(T),64,.3,5),o);this.disposables.push(C.geometry),h.add(C);for(let P=p+3;P<g-2;P+=4){const D=A(P),U=new $e(new mt(.12,D-f-.9,.12).translate(0,(D-f-.9)/2,0),o);U.position.set(P,f+.9,y*5.5),this.disposables.push(U.geometry),h.add(U),S.push([P,D-.5,y*5.5,0])}for(let P=4;P<u-3;P+=7)S.push([P,f+1.1,y*5.2,0]);for(const P of[p,g]){S.push([P,f+m+.4,y*5.5,1]);for(let D=1;D<=4;D+=1)S.push([P,f+m*D/5,y*5.5+y*.9,1])}}if(w&&S.length){const y=(T,C,P,D)=>{if(!T.length)return;const U=new Vt(new mt(P,P,P),C,T.length);T.forEach((R,B)=>{this.matrix.compose(this.positionVector.set(R[0],R[1],R[2]),this.quaternion.identity(),this.scaleVector.set(1,1,1)),U.setMatrixAt(B,this.matrix),D&&U.setColorAt(B,this.color.set(B%2===0?"#38e8ff":"#ff4fd8"))}),U.instanceMatrix.needsUpdate=!0,U.instanceColor&&(U.instanceColor.needsUpdate=!0),U.frustumCulled=!1,this.disposables.push(U.geometry),h.add(U)};y(S.filter(T=>T[3]===0),w.heads,.5,!1),y(S.filter(T=>T[3]===1),w.neon,.9,!0)}}h.name=`city-landmark-${c.kind}`,this.group.add(h)}}buildCivics(){const e=this.layout.civics??[];if(!e.length)return;const t=[],n=[],i=[],r=[[],[],[]];e.forEach((l,c)=>{const h=Math.cos(l.yaw),d=Math.sin(l.yaw),u=Math.max(.3,l.y),f=Math.min(l.width,48)*.82,m=Math.min(l.depth,40)*.82,_=(M,x)=>({x:l.x+M*h+x*d,z:l.z-M*d+x*h}),p=(M,x,w,S,A,y,T)=>{const C=_(M,w);t.push({civic:c,mesh:0,index:t.length,x:C.x,y:u+x,z:C.z,sx:S,sy:A,sz:y,yaw:l.yaw,baseY:u}),r[0].push(T)},g=(M,x,w,S,A,y)=>{const T=_(M,w);n.push({civic:c,mesh:1,index:n.length,x:T.x,y:u+x,z:T.z,sx:S,sy:A,sz:S,yaw:0,baseY:u}),r[1].push(y)},v=(M,x,w,S,A,y,T)=>{const C=_(M,w);i.push({civic:c,mesh:2,index:i.length,x:C.x,y:u+x,z:C.z,sx:S,sy:A,sz:y,yaw:l.yaw,baseY:u}),r[2].push(T)};if(l.kind==="school")p(-f*.38,0,-m*.18,f*.2,9,m*.6,"#e9d9b8"),p(f*.38,0,-m*.18,f*.2,9,m*.6,"#e9d9b8"),p(0,0,-m*.42,f*.96,11,m*.16,"#f1e4c6"),p(0,11,-m*.42,f*.96,.6,m*.18,"#b5533c"),p(0,.05,m*.22,f*.62,.12,m*.42,"#b8574a"),p(0,.1,m*.22,f*.5,.14,m*.3,"#6fa65a"),g(f*.42,0,m*.4,.15,12,"#d8dcdc"),p(f*.42+1.1,10.4,m*.4,2,1.3,.1,"#d84b3a"),v(0,11.6,-m*.42,f*.96,.22,.22,"#ffd08a"),v(-f*.38,9,-m*.18+m*.3,f*.2,.22,.22,"#ffd08a"),v(f*.38,9,-m*.18+m*.3,f*.2,.22,.22,"#ffd08a"),v(0,.3,m*.22,f*.62,.14,.2,"#46e6ff");else if(l.kind==="mall"){p(0,0,0,f,10,m,"#d9d3c7"),p(0,10,0,f*.98,.4,m*.98,"#6e7275");for(let M=-2;M<=2;M+=1)p(f*.15,10.45,M*m*.16,f*.5,.06,.25,"#e8e3c8");p(-f*.3,0,0,f*.24,13,m*.5,"#6f9fb6"),g(-f*.3,13,0,Math.min(f,m)*.12,2.5,"#9ac4d4"),p(f*.42,0,-m*.42,3.2,20,3.2,"#2f6f8f"),p(f*.42,15,-m*.42-1.7,6,4,.3,"#ff6f61"),v(f*.42,15,-m*.42-1.9,6,4,.1,"#ff4fd8"),v(0,10.5,m*.5,f,.22,.22,"#ff4fd8"),v(0,10.5,-m*.5,f,.22,.22,"#46e6ff"),v(-f*.3,13.4,0,Math.min(f,m)*.25,.22,Math.min(f,m)*.25,"#46e6ff")}else p(0,0,0,f*.34,22,m*.44,"#f4f5f2"),p(-f*.32,0,m*.06,f*.3,12,m*.34,"#ecefea"),p(f*.32,0,m*.06,f*.3,12,m*.34,"#ecefea"),g(0,22,0,Math.min(f,m)*.16,.4,"#5d6266"),p(0,22.42,0,Math.min(f,m)*.16,.05,1.2,"#f2f2ee"),p(0,16,m*.225,1.4,5,.3,"#e0352b"),p(0,16,m*.225,5,1.4,.3,"#e0352b"),p(0,0,m*.36,f*.3,3.4,4,"#d84a3d"),v(0,16,m*.235,1.2,4.8,.1,"#ff4a3d"),v(0,16,m*.235,4.8,1.2,.1,"#ff4a3d"),v(0,22.2,0,f*.34,.22,m*.44,"#7fe8ff"),v(0,3.5,m*.36+2,f*.3,.22,.22,"#ff4a3d")});const a=(l,c,h,d)=>{const u=this.makeInstanced(l.clone(),il(.18),Math.max(1,c.length));return u.castShadow=!0,u.receiveShadow=!0,u.count=c.length,h.forEach((f,m)=>u.setColorAt(m,this.color.set(f))),u.instanceColor&&(u.instanceColor.needsUpdate=!0),u.name=d,u},o=this.nightLights?new Vt(nn.clone(),this.nightLights.neon,Math.max(1,i.length)):a(nn,i,r[2],"city-civic-glow");o.count=i.length,this.nightLights&&(r[2].forEach((l,c)=>o.setColorAt(c,this.color.set(l))),o.instanceColor&&(o.instanceColor.needsUpdate=!0),o.frustumCulled=!1,o.name="city-civic-glow",this.group.add(o),this.disposables.push(o.geometry)),this.civicMeshes=[a(nn,t,r[0],"city-civic-boxes"),a(iu,n,r[1],"city-civic-cylinders"),o],this.civicPieces=[...t,...n,...i],this.civicProgress=e.map(()=>1),this.civicTarget=e.map(()=>1);for(let l=0;l<e.length;l+=1)this.writeCivic(l)}writeCivic(e){const t=this.civicProgress[e],n=t*t*(3-2*t);for(const i of this.civicPieces)i.civic===e&&(n<=.001?this.compose(i.x,-40,i.z,0,0,0,0):this.compose(i.x,i.baseY+(i.y-i.baseY)*n,i.z,i.yaw,i.sx,i.sy*n,i.sz),this.civicMeshes[i.mesh].setMatrixAt(i.index,this.matrix));for(const i of this.civicMeshes)i.instanceMatrix.needsUpdate=!0}updateCivics(e){for(let t=0;t<this.civicTarget.length;t+=1){const n=this.civicProgress[t],i=this.civicTarget[t];n!==i&&(this.civicProgress[t]=i>n?Math.min(i,n+e/1.2):Math.max(i,n-e/.6),this.writeCivic(t))}}roofKindFor(e,t){if(t===3)return 0;const n=this.zoneById.get(e.id),i=e.seed;return e.archetype==="landmark"||e.archetype==="tower"?i>.66?2:i>.3?3:0:(n==="residential"||n==="waterfront")&&e.height<30?i<.55?1:0:n==="commercial"?i<.4?4:i<.6?3:0:n==="downtown"&&i<.35?3:0}buildHeroCrown(e){const t=Aa(e.building.districtId),n=new ht({color:"#dfe6ea",emissive:new ge(t.accent).multiplyScalar(.12)}),i=new $e(new Gn(1,1,8,1).translate(0,.5,0),n);i.castShadow=!0;const r=new Dt({color:new ge(t.accent).multiplyScalar(3),toneMapped:!1}),a=[0,1,2].map(()=>new $e(new la(1,.06,6,40).rotateX(Math.PI/2),r));let o=null;const l=[i.geometry,n,r,...a.map(c=>c.geometry)];{const c=new Dt({color:new ge(t.accent).lerp(new ge("#ffffff"),.4).multiplyScalar(2.2),transparent:!0,opacity:.22,depthWrite:!1,blending:Jn,toneMapped:!1}),h=new fn(.6,1.6,1,16,6,!0).translate(0,.5,0),d=new Float32Array(h.attributes.position.count*3);for(let u=0;u<h.attributes.position.count;u+=1){const f=h.attributes.position.getY(u),m=Math.min(1,f/.03)*Math.pow(1-f,1.6);d[u*3]=d[u*3+1]=d[u*3+2]=m}h.setAttribute("color",new Ot(d,3)),c.vertexColors=!0,c.visible=!1,o=new $e(h,c),o.renderOrder=5,l.push(o.geometry,c),this.group.add(o)}this.group.add(i,...a),this.disposables.push(...l),this.heroParts={spire:i,rings:a,beam:o}}placeHeroCrown(e,t,n,i,r,a,o){const l=this.heroParts;if(!l)return;const c=o,h=Math.min(i,r)*.42,d=Math.max(14,a*.4);l.spire.visible=c,l.spire.position.set(e,t,n),l.spire.scale.set(h,d,h),l.rings.forEach((u,f)=>{u.visible=c;const m=.12+f*.2;u.position.set(e,t+d*m,n);const _=h*(1-m)+.6;u.scale.set(_,1,_)}),l.beam&&(l.beam.visible=c,l.beam.position.set(e,t+d,n),l.beam.scale.set(1,420,1))}facadeFor(e){const t=this.zoneById.get(e.id);return t?t==="waterfront"&&e.height<=36&&e.archetype!=="landmark"?3:t==="downtown"?2:t==="commercial"?1:t==="residential"?0:e.seed>.5?1:0:e.facade}buildMassing(){const e=this.layout.massing??[];if(!e.length)return;const t=this.makeInstanced(nn,new ht({color:"#c9c7bd"}),e.length);e.forEach((n,i)=>{this.compose(n.x,n.y,n.z,Be(`mass:${n.districtId}:${i}`)*.6-.3,16,n.height,12),t.setMatrixAt(i,this.matrix),t.setColorAt(i,this.color.set(i%2?"#c4c2b6":"#cdcbbf"))}),t.instanceMatrix.needsUpdate=!0,t.instanceColor&&(t.instanceColor.needsUpdate=!0),t.castShadow=!0,t.name="city-massing"}buildSeaMountains(){const e=this.layout.seaMountains??[];if(!e.length)return;const t=[...e].sort((n,i)=>i.height-n.height)[0];for(const n of e){if(n===t){const u=new $e(Lw(n.radius,n.height/2,this.layout.seed),new ht({vertexColors:!0,fog:!1}));u.position.set(n.center.x,-2,n.center.z),u.name="city-sea-volcano",this.group.add(u),this.disposables.push(u.geometry,u.material);continue}const i=new Gn(n.radius,n.height,11,4),r=i.attributes.position,a=new Float32Array(r.count*3),o=new ge("#a9a496"),l=new ge("#d6d0c2"),c=new ge;for(let u=0;u<r.count;u+=1){const f=r.getX(u),m=r.getY(u),_=r.getZ(u),p=1+fr(f*.03+n.seed,_*.03-n.seed,n.seed,3)*.22;r.setX(u,f*p),r.setZ(u,_*p),c.copy(o).lerp(l,Math.max(0,(m+n.height/2)/n.height)),a[u*3]=c.r,a[u*3+1]=c.g,a[u*3+2]=c.b}i.setAttribute("color",new Ot(a,3)),i.computeVertexNormals();const h=new ht({vertexColors:!0,fog:!1}),d=new $e(i,h);d.position.set(n.center.x,0,n.center.z),d.name="city-sea-mountain",this.group.add(d),this.disposables.push(i,h)}}treeSpots(){const e=xt(),t=[];for(const n of this.layout.districts)t.push(...n.trees);t.push(...this.layout.parkTrees??[]);{const n=this.layout.terrain,i=new pr(this.layout.roadEdges.map(h=>h.points)),r=new pr(this.layout.highways??[]),a=Math.max(0,...this.layout.roadEdges.map(h=>h.width/2))+1.2,o=this.layout.districts.flatMap(h=>[...h.slots.values()]),l=new pr(o.map(h=>[h,h])),c=o.reduce((h,d)=>Math.max(h,Math.hypot(d.width,d.depth)/2+1.2),0);for(const h of this.layout.roadEdges){if(h.bridge)continue;const[d,u]=h.points,f=Math.hypot(u.x-d.x,u.z-d.z);if(f<20)continue;const m=(u.x-d.x)/f,_=(u.z-d.z)/f,p=e.streetTreeSpacing*(h.kind==="arterial"?.8:1);for(let g=9,v=0;g<f-9;g+=p,v+=1){const M=v%2===0?1:-1,x=h.width/2+2.4,w=d.x+m*g-_*x*M,S=d.z+_*g+m*x*M,A=n.height(w,S);if(A<1.2)continue;const y={x:w,z:S};i.closerThan(y,a)||r.closerThan(y,su/2+2)||l.closerThan(y,c)||t.push({x:w,z:S,y:A,seed:Be(`street:${h.id}:${v}`)})}}}return t}roundTreeGeometry(){const e=xt(),t=new fn(.14,.2,.9,5).translate(0,.45,0),n=new aa(.78,0).translate(0,1.35,0);return this.tintedMerge([[t,e.trunk],[n,e.foliage]])}palmGeometry(){const e=xt(),t=4.6,n=new fn(.1,.19,t,6).translate(0,t/2,0),i=n.getAttribute("position");for(let o=0;o<i.count;o+=1){const l=i.getY(o)/t;i.setX(o,i.getX(o)+l*l*.55)}n.computeVertexNormals();const r=[[n,e.trunk]],a=8;for(let o=0;o<a;o+=1){const l=new mt(2.3,.05,.42).translate(1.15,0,0);l.rotateZ(-.42-o%2*.22),l.rotateY(o/a*Math.PI*2),l.translate(.55,t-.05,0),r.push([l,o%3===0?"#27a868":e.foliage])}return this.tintedMerge(r)}tintedMerge(e){let t=0;for(const[o]of e)t+=o.getAttribute("position").count;const n=new Float32Array(t*3);let i=0;const r=new ge;for(const[o,l]of e){r.set(l);for(let c=0;c<o.getAttribute("position").count;c+=1)n[i++]=r.r,n[i++]=r.g,n[i++]=r.b}const a=Op(e.map(([o])=>o));a.setAttribute("color",new Ot(n,3));for(const[o]of e)o.dispose();return a}applyFlora(e){if(!e.length||this.floraMeshes.length)return;const t=this.treeSpots(),n=e.reduce((r,a)=>r+a.species.weight,0),i=e.map(()=>[]);for(const r of t){let a=Be(`flora:${r.x.toFixed(1)}:${r.z.toFixed(1)}`)*n,o=0;for(;o<e.length-1&&a>=e[o].species.weight;)a-=e[o].species.weight,o+=1;i[o].push(r)}e.forEach(({species:r,geometry:a},o)=>{const l=i[o];if(!l.length)return;const c=new ht({vertexColors:!0,flatShading:!0}),h=new Vt(a,c,l.length);h.castShadow=!0,h.receiveShadow=!0;const d=r.tint?new ge(r.tint):null;l.forEach((u,f)=>{const m=r.height*(.8+u.seed*.45);this.compose(u.x,u.y-.1,u.z,u.seed*Math.PI*2,m,m,m),h.setMatrixAt(f,this.matrix),h.setColorAt(f,d?this.color.copy(d).lerp(new ge("#ffffff"),.25+u.seed*.2):this.color.set("#ffffff").multiplyScalar(.88+u.seed*.2))}),h.instanceMatrix.needsUpdate=!0,h.instanceColor&&(h.instanceColor.needsUpdate=!0),h.name=`city-flora-${o}`,this.group.add(h),this.floraMeshes.push(h),this.disposables.push(c)}),this.floraMeshes.length&&(this.treeMesh.visible=!1)}buildTrees(){const e=this.treeSpots(),t=this.palmGeometry(),n=new ht({vertexColors:!0}),i=new Vt(t,n,Math.max(e.length,1));return i.castShadow=!0,e.forEach((r,a)=>{const o=1.25+r.seed*.7;this.compose(r.x,r.y-.1,r.z,r.seed*Math.PI*2,o,o,o),i.setMatrixAt(a,this.matrix)}),i.count=e.length,this.group.add(i),this.disposables.push(t,n),i}buildCars(){const e=[];for(const o of this.layout.districts)for(const l of o.carPaths){const{cumulative:c,total:h}=Np(l);e.push({points:l,cumulative:c,total:h,y:.08,terrain:o.terrain})}const t=[];e.forEach((o,l)=>{for(let h=0;h<3;h+=1){const d=Be(`car:${l}:${h}`);t.push({path:o,distance:h/3*o.total+d*5,speed:6.5+d*6})}});const n=["#f8f5ec","#c96f4a","#4d7ca8","#3f8f7a","#d8a13c","#8d5a5a"],i=new mt(2.5,.8,1.2).translate(0,.4,0),r=new ht({color:"#ffffff"}),a=new Vt(i,r,Math.max(t.length,1));return a.instanceMatrix.setUsage(Hi),t.forEach((o,l)=>{const c=n[Math.floor(Be(`carc:${l}`)*n.length)];a.setColorAt(l,this.color.set(c))}),a.count=t.length,a.frustumCulled=!1,this.group.add(a),this.disposables.push(i,r),{mesh:a,cars:t}}buildBoats(){var m;const e=[];(m=this.layout.boatLoops)==null||m.forEach((_,p)=>{const{cumulative:g,total:v}=Np(_),M=3+p%2;for(let x=0;x<M;x+=1)e.push({path:{points:_,cumulative:g,total:v,y:-.3,terrain:null},distance:x/M*v+Be(`bd:${p}:${x}`)*40,speed:(p%2===0?1:-1)*(2.6+Be(`bs:${p}:${x}`)*1.6),phase:Be(`bp:${p}:${x}`)*Math.PI*2,wakeTimer:Be(`bt:${p}:${x}`)*.3})});const t=new mt(11.5,2,4).translate(0,1,0),n=new mt(4.3,1.8,2.9).translate(1.4,2.9,0),i=Op([t,n]),r=new ht({color:"#f2efe6"}),a=new Vt(i,r,Math.max(e.length,1));a.instanceMatrix.setUsage(Hi),e.forEach((_,p)=>{a.setColorAt(p,this.color.set(p%3===0?"#c96f4a":p%3===1?"#5d7f9a":"#e8e2d5"))}),a.count=e.length,a.frustumCulled=!1,this.group.add(a),this.disposables.push(i,r,t,n);const o=gr();o.width=o.height=64;const l=o.getContext("2d");if(l){const _=l.createRadialGradient(32,32,0,32,32,32);_.addColorStop(0,"rgba(255,255,255,0.95)"),_.addColorStop(.45,"rgba(255,255,255,0.4)"),_.addColorStop(1,"rgba(255,255,255,0)"),l.fillStyle=_,l.fillRect(0,0,64,64)}const c=new Hc(o),h=new Dt({color:"#eef6f7",map:c,transparent:!0,opacity:.5,depthWrite:!1,toneMapped:!1}),d=new Jr(1,10).rotateX(-Math.PI/2),u=new Vt(d,h,128);u.instanceMatrix.setUsage(Hi),u.frustumCulled=!1,u.renderOrder=1;const f=[];for(let _=0;_<128;_+=1)f.push({x:0,z:0,birth:-1,driftX:0,driftZ:0}),this.compose(0,-60,0,0,1e-4,1e-4,1e-4),u.setMatrixAt(_,this.matrix);return this.group.add(u),this.disposables.push(c,h,d),{mesh:a,boats:e,wakeMesh:u,wakes:f}}buildClouds(){const e=[],t=this.layout.boundsRadius+40;for(let a=0;a<3;a+=1){const o=Be(`cloud:${a}`);e.push({x:(o-.5)*t*2,z:(Be(`cz:${a}`)-.5)*t*2,y:220+o*44,speed:.65+o*.7,scale:.5+o*.4})}const n=new Dn(1,8,6),i=new ht({color:"#ffffff",transparent:!0,opacity:.88,fog:!1}),r=new Vt(n,i,e.length);return r.instanceMatrix.setUsage(Hi),e.forEach((a,o)=>{const l=9.5*a.scale;this.compose(a.x,a.y,a.z,0,l*1.6,l*.34,l*.8),r.setMatrixAt(o,this.matrix)}),r.count=e.length,r.frustumCulled=!1,this.group.add(r),this.disposables.push(n,i),{mesh:r,clouds:e}}buildAnomalyMarkers(){for(const e of this.layout.districts){if(!e.anomaly)continue;const t=e.anomaly.severity==="critical"?"#d64545":e.anomaly.severity==="warning"?"#e0940f":"#4a7fa0",n=new jc(1.15),i=new Dt({color:t}),r=new $e(n,i);r.position.set(e.plaza.x,e.plaza.y+9,e.plaza.z),r.renderOrder=2;const a=new oa(2.6,3,44).rotateX(-Math.PI/2),o=new Dt({color:t,transparent:!0,opacity:.5,depthWrite:!1}),l=new $e(a,o);l.position.set(e.plaza.x,e.plaza.y+.16,e.plaza.z),l.renderOrder=3,this.group.add(r,l),this.anomalyMarkers.push({mesh:r,ring:l,baseY:e.plaza.y+9,phase:Be(`anom:${e.id}`)*Math.PI*2}),this.disposables.push(n,i,a,o)}}buildLabels(){for(const e of this.layout.districts){const t=Aa(e.id),n=`${e.sessionCount} sessions`,{texture:i,aspect:r}=Cw(e.label,n,t.accent);i.colorSpace=Wt;const a=new rf({map:i,depthTest:!1,transparent:!0,sizeAttenuation:!1}),o=new m0(a),l=.018;o.scale.set(l*r,l,1),o.renderOrder=20,o.position.set(e.center.x,e.plaza.y+45,e.center.z),this.group.add(o),this.labels.push(o),this.disposables.push(a,i)}}buildWater(){const e=new ni(9e3,9e3,1,1).rotateX(-Math.PI/2),t=384,n=1500,i=new Uint8Array(t*t);for(let l=0;l<t;l+=1)for(let c=0;c<t;c+=1){const h=(c/(t-1)-.5)*n*2,d=(l/(t-1)-.5)*n*2,u=this.layout.terrain.height(h,d);i[l*t+c]=Math.max(0,Math.min(255,Math.round(-u/16*255)))}const r=new Ws(i,t,t,Na,vn);r.minFilter=Gt,r.magFilter=Gt,r.wrapS=Fn,r.wrapT=Fn,r.needsUpdate=!0,this.disposables.push(r);const a=new gt({uniforms:{uTime:{value:0},uSun:{value:new L(.55,.75,.36).normalize()},uDeep:{value:new ge(xt().water.deep)},uShallow:{value:new ge(xt().water.shallow)},uSky:{value:new ge(xt().water.sky)},uDepth:{value:r},uDepthWorld:{value:n},uFog:{value:new ge(xt().skyHorizon)},uFogRange:{value:new pe(...xt().waterFog)},uNormal:{value:null},uMirror:{value:null},uMirrorMatrix:{value:new De},uHasMirror:{value:0},uNight:{value:0},uSkyTex:{value:null},uHasAssets:{value:0},uGradeTop:{value:new ge(xt().skyGrade.top)},uGradeHorizon:{value:new ge(xt().skyGrade.horizon)},uGradeAmount:{value:xt().skyGrade.amount},uSkyYaw:{value:_h(xt())}},vertexShader:`
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
      `});this.waterAssetUniforms=a.uniforms;const o=new $e(e,a);return o.position.y=-.55,this.disposables.push(e,a),o}buildRuntimes(){var u;const e=new Map(this.layout.districts.map(f=>[f.id,f]));let t=0,n=0,i=0,r=0,a=0,o=0;const l=[0,0,0,0];let c=0;const h=[...this.model.buildings].sort((f,m)=>f.startedAt-m.startedAt);for(const f of h){const m=e.get(f.districtId),_=m==null?void 0:m.slots.get(f.id);if(!m||!_)continue;const p=Aa(f.districtId),g={building:f,slot:_,facade:-1,groundY:m.grounds.get(f.id)??0,paletteWall:new ge(p.wall).multiplyScalar(.92+f.seed*.16),display:((u=this.previousDisplays)==null?void 0:u.get(f.id))??0,target:f.builtFraction,settled:this.previousDisplays?this.previousDisplays.has(f.id):!0,district:m,shaftPrimary:-1,shaftUpper:-1,podium:-1,roof:-1,scaffold:-1,antenna:-1,beacon:-1,craneMast:-1,craneArm:-1,cranePhase:f.seed*Math.PI*2,craneX:0,craneZ:0,blinkPhase:Be(`blink:${f.id}`)*Math.PI*2,deco:-1,roofKind:0,hero:!1};if(g.facade=this.facadeFor(f),g.facade===3){g.deco=c,c+=1,g.paletteWall=new ge(p.accent).lerp(new ge("#ffffff"),.52).multiplyScalar(.96+f.seed*.08);const y=new ge(p.accent).lerp(new ge("#ffffff"),.35);this.decoCornerMesh.setColorAt(g.deco,g.paletteWall.clone().multiplyScalar(1.06)),this.decoTrimMesh.setColorAt(g.deco*2,y),this.decoTrimMesh.setColorAt(g.deco*2+1,y.clone().multiplyScalar(.92))}const v=this.shaftMeshes[g.facade],M=this.shaftIdByInstance[g.facade],x=f.archetype==="tower"||f.archetype==="landmark";g.shaftPrimary=l[g.facade],v.setColorAt(g.shaftPrimary,g.paletteWall),v.geometry.getAttribute("aFloors").setX(g.shaftPrimary,Math.max(2,Math.round(f.height/3.1))),M.set(g.shaftPrimary,f.id),l[g.facade]+=1,x&&(g.shaftUpper=l[g.facade],v.setColorAt(g.shaftUpper,g.paletteWall.clone().multiplyScalar(.94)),v.geometry.getAttribute("aFloors").setX(g.shaftUpper,Math.max(2,Math.round(f.height*.28/3.1))),M.set(g.shaftUpper,f.id),l[g.facade]+=1),f.archetype!=="tower"&&f.archetype!=="landmark"&&(g.podium=t,this.podiumMesh.setColorAt(t,g.paletteWall.clone().multiplyScalar(.88)),t+=1),g.roof=n,this.roofMesh.setColorAt(n,new ge(p.roof).multiplyScalar(.94+f.seed*.12)),g.roofKind=this.roofKindFor(f,g.facade);const A=[new ge(p.roof).multiplyScalar(.94+f.seed*.12),new ge(p.accent).lerp(new ge("#e8eef0"),.55),g.paletteWall.clone().multiplyScalar(.96),new ge("#7fae6a")];this.roofProfiles.forEach((y,T)=>y.setColorAt(n,A[T])),this.neonMesh.setColorAt(n,new ge(p.accent).multiplyScalar(3.2)),n+=1,g.scaffold=i,i+=1,f.archetype==="landmark"&&r<94&&(g.antenna=r,r+=1,g.beacon=a,a+=1),f.active&&o<46&&(g.craneMast=o,g.craneArm=o,o+=1),this.runtimes.push(g),this.runtimeById.set(f.id,g)}this.shaftMeshes.forEach((f,m)=>{f.count=l[m],f.instanceColor&&(f.instanceColor.needsUpdate=!0)}),this.podiumMesh.count=t,this.podiumMesh.instanceColor&&(this.podiumMesh.instanceColor.needsUpdate=!0),this.roofMesh.count=n;for(const f of this.roofProfiles)f.count=n,f.instanceColor&&(f.instanceColor.needsUpdate=!0);this.gardenTreeMesh.count=n*3;let d=null;for(const f of this.runtimes)(!d||f.building.tokensTotal>d.building.tokensTotal)&&(d=f);d&&(d.hero=!0,d.roofKind=0,this.buildHeroCrown(d)),this.neonMesh.count=n,this.neonMesh.instanceColor&&(this.neonMesh.instanceColor.needsUpdate=!0),this.roofMesh.instanceColor&&(this.roofMesh.instanceColor.needsUpdate=!0),this.scaffoldMesh.count=i,this.antennaMesh.count=r,this.beaconMesh.count=a,this.craneMastMesh.count=o,this.decoCornerMesh.count=c,this.decoTrimMesh.count=c*2,this.decoCornerMesh.instanceColor&&(this.decoCornerMesh.instanceColor.needsUpdate=!0),this.decoTrimMesh.instanceColor&&(this.decoTrimMesh.instanceColor.needsUpdate=!0),this.craneArmMesh.count=o;for(const f of this.runtimes)this.applyConstruction(f,f.settled)}compose(e,t,n,i,r,a,o){this.euler.set(0,i,0),this.quaternion.setFromEuler(this.euler),this.positionVector.set(e,t,n),this.scaleVector.set(Math.max(r,1e-4),Math.max(a,1e-4),Math.max(o,1e-4)),this.matrix.compose(this.positionVector,this.quaternion,this.scaleVector)}applyConstruction(e,t){const n=e.building,{x:i,z:r}=e.slot,a=e.groundY,o=t?e.target:e.display,l=Math.max(0,Math.min(1,o));if(l<=.001){this.hideAll(e);return}const c=n.height,h=n.footprint,d=Math.max(.5,l*c),u=n.archetype==="tower"||n.archetype==="landmark"?.72:1,f=e.podium>=0?Math.min(d,1.5):0;let m;n.archetype==="slab"?m=[h*1.3,h*.58]:n.archetype==="block"?m=[h*1.2,h*.85]:n.archetype==="tower"||n.archetype==="landmark"?m=[h*.86,h*.55]:m=[h,h];const _=e.slot.width*(e.slot.zone==="downtown"?.8:.88);n.archetype!=="tower"&&n.archetype!=="landmark"&&(m[0]=Math.max(m[0],_)),m[0]=Math.min(m[0],e.slot.width-.8),m[1]=Math.min(m[1],e.slot.depth-2);const p=e.slot.yaw,g=a+f,v=a+Math.min(d,c*u),M=Math.max(0,v-g);if(e.shaftPrimary>=0&&(M<.15?this.compose(i,-40,r,0,0,0,0):this.compose(i,g,r,p,m[0],M,m[1]),this.shaftMeshes[e.facade].setMatrixAt(e.shaftPrimary,this.matrix)),e.shaftUpper>=0){const x=Math.max(0,d-c*u);x<.15?this.compose(i,-40,r,0,0,0,0):this.compose(i,a+c*u,r,p,m[0]*.72,x,m[1]*.72),this.shaftMeshes[e.facade].setMatrixAt(e.shaftUpper,this.matrix)}if(e.podium>=0&&(this.compose(i,a,r,p,h*1.16,f>.1?f:0,h*1.16),this.podiumMesh.setMatrixAt(e.podium,this.matrix)),e.roof>=0){const x=a+Math.max(.4,d-.18),w=e.shaftUpper>=0&&d>c*u?m[0]*.78:m[0]*1.06,S=e.shaftUpper>=0&&d>c*u?m[1]*.78:m[1]*1.06;this.compose(i,x,r,p,w,.34,S),this.roofMesh.setMatrixAt(e.roof,this.matrix),this.compose(i,x-.12,r,p,w*1.16,.3,S*1.16),this.neonMesh.setMatrixAt(e.roof,this.matrix);const A=l>.985,y=x+.34;this.roofProfiles.forEach((T,C)=>{const P=C+1;!A||e.roofKind!==P?this.compose(i,-40,r,0,0,0,0):P===1?this.compose(i,y,r,p,w,Math.min(w,S)*.42,S):P===2?this.compose(i,y,r,p,w*.92,Math.max(6,c*.22),S*.92):P===3?this.compose(i,y,r,p,w*.62,Math.max(2.4,c*.06),S*.62):this.compose(i,y,r,p,w*.86,.35,S*.86),T.setMatrixAt(e.roof,this.matrix)});for(let T=0;T<3;T+=1){if(A&&e.roofKind===4){const C=e.building.seed*6.283+T*2.1,P=Math.min(w,S)*.28,D=.7+(e.building.seed*7+T)%1*.5;this.compose(i+Math.cos(C)*P,y+.3,r+Math.sin(C)*P,0,D,D*1.1,D)}else this.compose(i,-40,r,0,0,0,0);this.gardenTreeMesh.setMatrixAt(e.roof*3+T,this.matrix)}e.hero&&this.placeHeroCrown(i,x+.34,r,w,S,c,A)}if(e.scaffold>=0){const x=c-d;l<.985&&x>.6?this.compose(i,a+d,r,p,m[0]*1.14,x,m[1]*1.14):this.compose(i,-40,r,0,0,0,0),this.scaffoldMesh.setMatrixAt(e.scaffold,this.matrix)}if(e.deco>=0){const x=(P,D)=>({x:i+P*Math.cos(p)+D*Math.sin(p),z:r-P*Math.sin(p)+D*Math.cos(p)}),w=Math.min(m[0],m[1])*.24,S=x(m[0]/2-w*.55,m[1]/2-w*.55);this.compose(S.x,a,S.z,0,w,Math.max(.2,d+.4),w),this.decoCornerMesh.setMatrixAt(e.deco,this.matrix);const A=l>.985,y=x(0,m[1]*.1);this.compose(y.x,a+d,y.z,p,A?m[0]*.42:0,A?2.4:0,A?m[1]*.7:0),this.decoTrimMesh.setMatrixAt(e.deco*2,this.matrix);const T=x(-m[0]*.08,m[1]/2+.8),C=d>3.4;this.compose(T.x,a+2.7,T.z,p,C?m[0]*.66:0,C?.28:0,C?1.7:0),this.decoTrimMesh.setMatrixAt(e.deco*2+1,this.matrix)}if(e.antenna>=0){const x=l>.985;this.compose(i,a+c,r,0,1,x?c*.1+3.4:0,1),this.antennaMesh.setMatrixAt(e.antenna,this.matrix),this.compose(i,a+c+(x?c*.1+3.4:0),r,0,1,1,1),this.beaconMesh.setMatrixAt(e.beacon>=0?e.beacon:0,this.matrix)}if(e.craneMast>=0){const x=c*1.02+6.5,w=m[0]*.5+.6,S=m[1]*.5+.6,A=i+w*Math.cos(p)+S*Math.sin(p),y=r-w*Math.sin(p)+S*Math.cos(p);e.craneX=A,e.craneZ=y,this.compose(A,a,y,0,1,x,1),this.craneMastMesh.setMatrixAt(e.craneMast,this.matrix),this.applyCraneArm(e,A,y,a,x,0)}}applyCraneArm(e,t,n,i,r,a){const o=e.building.footprint*2.4+3.4,l=e.cranePhase+a,c=t+Math.cos(l)*o*.34,h=n-Math.sin(l)*o*.34;this.compose(c,i+r+.1,h,l,o,2.2,2.2),this.craneArmMesh.setMatrixAt(e.craneArm,this.matrix)}hideAll(e){if(this.compose(0,-40,0,0,0,0,0),e.building,e.shaftPrimary>=0&&this.shaftMeshes[e.facade].setMatrixAt(e.shaftPrimary,this.matrix),e.shaftUpper>=0&&this.shaftMeshes[e.facade].setMatrixAt(e.shaftUpper,this.matrix),e.podium>=0&&this.podiumMesh.setMatrixAt(e.podium,this.matrix),e.deco>=0&&(this.decoCornerMesh.setMatrixAt(e.deco,this.matrix),this.decoTrimMesh.setMatrixAt(e.deco*2,this.matrix),this.decoTrimMesh.setMatrixAt(e.deco*2+1,this.matrix)),e.roof>=0){this.roofMesh.setMatrixAt(e.roof,this.matrix),this.neonMesh.setMatrixAt(e.roof,this.matrix);for(const t of this.roofProfiles)t.setMatrixAt(e.roof,this.matrix);for(let t=0;t<3;t+=1)this.gardenTreeMesh.setMatrixAt(e.roof*3+t,this.matrix);e.hero&&this.heroParts&&this.placeHeroCrown(0,-40,0,0,0,0,!1)}e.scaffold>=0&&this.scaffoldMesh.setMatrixAt(e.scaffold,this.matrix),e.antenna>=0&&this.antennaMesh.setMatrixAt(e.antenna,this.matrix),e.beacon>=0&&this.beaconMesh.setMatrixAt(e.beacon,this.matrix),e.craneMast>=0&&(this.craneMastMesh.setMatrixAt(e.craneMast,this.matrix),this.craneArmMesh.setMatrixAt(e.craneArm,this.matrix))}applyCursor(e,t,n=0){this.cursor=e,this.live=t,(this.layout.civics??[]).forEach((i,r)=>{this.civicTarget[r]=t||e>=i.unlockAt?1:0});for(const i of this.runtimes)i.target=mw(i.building,e,t,n),t&&i.building.active&&(i.target=Math.max(i.target,i.building.builtFraction))}displaySnapshot(){const e=new Map;for(const[t,n]of this.runtimeById)e.set(t,n.display);return e}snapToTargets(){for(const e of this.runtimes)e.settled&&(e.display=e.target,this.applyConstruction(e,!0));for(let e=0;e<this.civicTarget.length;e+=1)this.civicProgress[e]!==this.civicTarget[e]&&(this.civicProgress[e]=this.civicTarget[e],this.writeCivic(e));for(const e of this.shaftMeshes)e.instanceMatrix.needsUpdate=!0;this.podiumMesh.instanceMatrix.needsUpdate=!0,this.decoCornerMesh.instanceMatrix.needsUpdate=!0,this.decoTrimMesh.instanceMatrix.needsUpdate=!0;for(const e of this.roofProfiles)e.instanceMatrix.needsUpdate=!0;this.gardenTreeMesh.instanceMatrix.needsUpdate=!0,this.roofMesh.instanceMatrix.needsUpdate=!0,this.neonMesh.instanceMatrix.needsUpdate=!0,this.scaffoldMesh.instanceMatrix.needsUpdate=!0,this.antennaMesh.instanceMatrix.needsUpdate=!0,this.craneMastMesh.instanceMatrix.needsUpdate=!0}setQualityLevel(e){this.cloudMesh.visible=e>=1,this.carKeep=e>=1?1:.5,this.applyCarDensity()}applyCarDensity(){const e=Math.floor(this.cars.length*this.carKeep);this.cars.forEach((t,n)=>{const i=Fp(t);t.speed=n<e?i:0,this.placeCar(t,n,n<e)}),this.carMesh.instanceMatrix.needsUpdate=!0}placeCar(e,t,n){if(!n)this.compose(0,-40,0,0,0,0,0);else{const i=zp(e.path,e.distance),r=e.path.terrain?e.path.terrain.height(i.x,i.z)+e.path.y:e.path.y;this.compose(i.x-i.dz*1.2,r+.04,i.z+i.dx*1.2,Math.atan2(-i.dz,i.dx),1,1,1)}this.carMesh.setMatrixAt(t,this.matrix)}setScaffoldVisible(e){this.scaffoldMesh.visible=e}hideOverlaysForPhoto(){const e=this.labels.map(i=>i.visible),t=[this.hoverRing.visible,this.selectRing.visible],n=this.scaffoldMesh.visible;this.scaffoldMesh.visible=!1;for(const i of this.labels)i.visible=!1;return this.hoverRing.visible=!1,this.selectRing.visible=!1,()=>{this.labels.forEach((i,r)=>{i.visible=e[r]}),this.hoverRing.visible=t[0],this.selectRing.visible=t[1],this.scaffoldMesh.visible=n}}setLabelsVisible(e){this.labelsVisible=e;for(const t of this.labels)t.visible=e}idAt(e,t){const n=this.shaftMeshes.indexOf(e);return n<0?null:this.shaftIdByInstance[n].get(t)??null}anchors(){const e=new Map;for(const[t,n]of this.runtimeById)e.set(t,{x:n.slot.x,z:n.slot.z,height:n.building.height,ground:n.groundY});return e}get cloudMaterial(){return this.cloudMesh?this.cloudMesh.material:null}get waterColors(){return this.water?this.water.material.uniforms:null}setNightGlow(e){var r,a;this.nightGlow=e;const t=Math.max(0,(e-.1)/.9),n=(a=(r=this.heroParts)==null?void 0:r.beam)==null?void 0:a.material;n&&(n.visible=t>.05,n.opacity=.22*Math.min(1,t*1.5));const i=this.nightLights;i&&(i.heads.color.setRGB(1,.78,.45).multiplyScalar(t*3.2),i.pools.color.setRGB(1,.62,.3).multiplyScalar(t*.9),i.pools.visible=t>.03,i.strips.color.setRGB(1,.7,.4).multiplyScalar(t*2.4),i.neon.color.setRGB(1,1,1).multiplyScalar(t*2.6),i.neon.visible=t>.04)}applySelfLit(e){for(const t of this.facadeUniforms)t.uSelfLit.value=e,t.uWindowGlow.value=this.nightGlow}anchorFor(e){const t=this.runtimeById.get(e);return t?{x:t.slot.x,z:t.slot.z,height:t.building.height,ground:t.groundY}:null}setHovered(e){this.hoveredId=e;const t=e?this.anchorFor(e):null;if(!t){this.hoverRing.visible=!1;return}const n=e?this.runtimeById.get(e):null,i=n?n.building.footprint*1.5:3;this.hoverRing.scale.set(i,1,i),this.hoverRing.position.set(t.x,t.ground+.18,t.z),this.hoverRing.visible=!0}setSelected(e){this.selectedId=e;const t=e?this.anchorFor(e):null;if(!t){this.selectRing.visible=!1;return}const n=e?this.runtimeById.get(e):null,i=n?n.building.footprint*1.7:3.4;this.selectRing.scale.set(i,1,i),this.selectRing.position.set(t.x,t.ground+.2,t.z),this.selectRing.visible=!0}update(e,t){this.waterUniforms.uTime.value=t,this.flagTime&&(this.flagTime.value=t),this.updateCivics(e);for(const h of this.landmarkSpinners)h.object.rotation[h.axis]+=h.speed*e;let n=!1;const i=Math.min(1,e*1.35);for(const h of this.runtimes)Math.abs(h.display-h.target)>.0012?(h.display+=(h.target-h.display)*i,this.applyConstruction(h,!1),n=!0):h.display!==h.target&&(h.display=h.target,h.settled=!0,this.applyConstruction(h,!1),n=!0);if(n||Number.isNaN(this.cursor)){for(const h of this.shaftMeshes)h.instanceMatrix.needsUpdate=!0;this.podiumMesh.instanceMatrix.needsUpdate=!0,this.decoCornerMesh.instanceMatrix.needsUpdate=!0,this.decoTrimMesh.instanceMatrix.needsUpdate=!0;for(const h of this.roofProfiles)h.instanceMatrix.needsUpdate=!0;this.gardenTreeMesh.instanceMatrix.needsUpdate=!0,this.roofMesh.instanceMatrix.needsUpdate=!0,this.neonMesh.instanceMatrix.needsUpdate=!0,this.scaffoldMesh.instanceMatrix.needsUpdate=!0,this.antennaMesh.instanceMatrix.needsUpdate=!0,this.craneMastMesh.instanceMatrix.needsUpdate=!0}for(const h of this.runtimes){if(h.craneArm<0||h.display<=.002||h.craneX===0&&h.craneZ===0)continue;const d=(.25+h.building.busyness*.85)*e;h.cranePhase+=d;const u=h.building.height*1.02+6.5,f=h.craneX,m=h.craneZ;if(this.applyCraneArm(h,f,m,h.groundY,u,0),this.craneArmMesh.instanceMatrix.needsUpdate=!0,h.beacon>=0){const _=.55+.45*Math.sin(t*2.4+h.blinkPhase);this.compose(f,h.groundY+u+.3,m,0,_,_,_),this.beaconMesh.setMatrixAt(h.beacon,this.matrix),this.beaconMesh.instanceMatrix.needsUpdate=!0}}let r=!1;this.cars.forEach((h,d)=>{h.speed!==0&&(h.distance+=h.speed*e,this.placeCar(h,d,!0),r=!0)}),r&&(this.carMesh.instanceMatrix.needsUpdate=!0);let a=0;this.boats.forEach((h,d)=>{h.distance+=h.speed*e;const u=zp(h.path,h.distance),f=Math.sin(t*.9+h.phase)*.12;if(this.compose(u.x,-.3+f,u.z,Math.atan2(-u.dz,u.dx),1,1,1),this.boatMesh.setMatrixAt(d,this.matrix),h.wakeTimer-=e,h.wakeTimer<=0){h.wakeTimer=.3+.08*Math.sin(t*1.7+h.phase);const m=this.wakes[a];a=(a+1)%this.wakes.length;const _=Math.sin(t*5.3+h.phase+d);m.x=u.x-u.dx*6.4-u.dz*_*1.6,m.z=u.z-u.dz*6.4+u.dx*_*1.6,m.birth=t,m.driftX=-u.dx*.5-u.dz*_*.35,m.driftZ=-u.dz*.5+u.dx*_*.35}}),this.boatMesh.instanceMatrix.needsUpdate=!0;let o=!1;for(let h=0;h<this.wakes.length;h+=1){const d=this.wakes[h];if(d.birth<0)continue;const u=t-d.birth;u>2.8?(d.birth=-1,this.compose(0,-60,0,0,1e-4,1e-4,1e-4)):(d.x+=d.driftX*e,d.z+=d.driftZ*e,this.compose(d.x,-.44,d.z,u*.5,1.1+u*2.3,1,1.1+u*2.3)),this.wakeMesh.setMatrixAt(h,this.matrix),o=!0}o&&(this.wakeMesh.instanceMatrix.needsUpdate=!0);const l=this.layout.boundsRadius+60;this.clouds.forEach((h,d)=>{h.x+=h.speed*e,h.x>l&&(h.x=-l);const u=9.5*h.scale;this.compose(h.x,h.y,h.z,0,u*1.6,u*.34,u*.8),this.cloudMesh.setMatrixAt(d,this.matrix)}),this.cloudMesh.visible&&(this.cloudMesh.instanceMatrix.needsUpdate=!0);for(const h of this.anomalyMarkers){h.mesh.position.y=h.baseY+Math.sin(t*1.4+h.phase)*.6,h.mesh.rotation.y=t*.9+h.phase,h.mesh.rotation.x=Math.sin(t*.7+h.phase)*.18;const d=.86+.14*Math.sin(t*2.6+h.phase);h.ring.scale.set(d,1,d),h.ring.material.opacity=.32+.3*(.5+.5*Math.sin(t*2.6+h.phase))}const c=.55+.3*(.5+.5*Math.sin(t*3.2));return this.hoverRing.visible&&(this.hoverRing.material.opacity=c),this.selectRing.visible&&(this.selectRing.material.opacity=.6+.3*(.5+.5*Math.sin(t*2.4))),n||r}captureAnimationOrigin(){for(const e of this.cars)Ji(e,e.distance),Fp(e);for(const e of this.boats)Ji(e,e.distance);for(const e of this.clouds)Ji(e,e.x);for(const e of this.landmarkSpinners)Ji(e,e.object.rotation[e.axis])}resetAnimation(){for(const e of this.cars)e.distance=Ji(e,e.distance);this.applyCarDensity();for(const e of this.boats)e.distance=Ji(e,e.distance);for(const e of this.clouds)e.x=Ji(e,e.x);for(const e of this.landmarkSpinners)e.object.rotation[e.axis]=Ji(e,e.object.rotation[e.axis]);for(const e of this.runtimes)e.cranePhase=e.building.seed*Math.PI*2,e.display=e.target,e.settled=!0,this.applyConstruction(e,!1);for(const e of[...this.shaftMeshes,...this.roofProfiles,this.podiumMesh,this.decoCornerMesh,this.decoTrimMesh,this.gardenTreeMesh,this.roofMesh,this.neonMesh,this.scaffoldMesh,this.antennaMesh,this.craneMastMesh,this.craneArmMesh,this.beaconMesh])e.instanceMatrix.needsUpdate=!0;for(let e=0;e<this.civicTarget.length;e+=1)this.civicProgress[e]!==this.civicTarget[e]&&(this.civicProgress[e]=this.civicTarget[e],this.writeCivic(e))}districtAnchor(e){const t=this.layout.districts.find(n=>n.id===e);return t?{x:t.center.x,z:t.center.z,y:t.plaza.y,radius:t.radius}:null}dispose(){this.group.removeFromParent(),An&&An.seed===this.layout.seed&&this.group.remove(An.group);for(const e of this.disposables)e.dispose()}}function Op(s){const e=new At;for(const i of["position","normal","uv"]){const r=s[0].getAttribute(i);if(!r)continue;const a=new Float32Array(s.reduce((l,c)=>{var h;return l+(((h=c.getAttribute(i))==null?void 0:h.array.length)??0)},0));let o=0;for(const l of s){const c=l.getAttribute(i);c&&(a.set(c.array,o),o+=c.array.length)}e.setAttribute(i,new Ot(a,r.itemSize))}const t=[];let n=0;for(const i of s){if(i.index)for(const r of i.index.array)t.push(r+n);else for(let r=0;r<i.getAttribute("position").count;r+=1)t.push(r+n);n+=i.getAttribute("position").count}return e.setIndex(t),e}const Bp={top:"#a3cee6",middle:"#cfe6ea",horizon:"#eef6ee",fog:"#dfeef2",fogNearFactor:2.1,fogFarFactor:7.5,hemiSky:"#eaf6fa",hemiGround:"#cbbfa6",hemiIntensity:.95,sunColor:"#fff3de",sunIntensity:1.55,sunAzimuth:1.05,sunElevation:.95,fillColor:"#cfe8ef",fillIntensity:.35,backColor:"#ffffff",backIntensity:.15,waterShallow:"#a5d6da",waterDeep:"#57a3b4",cloudOpacity:.88,selfLit:.05,stars:0},kp={top:"#7f8fb4",middle:"#e3b07e",horizon:"#f4d9a6",fog:"#e9d6bc",fogNearFactor:1.9,fogFarFactor:7,hemiSky:"#f0dcc2",hemiGround:"#8d7c66",hemiIntensity:.72,sunColor:"#ffcf96",sunIntensity:1.05,sunAzimuth:3.35,sunElevation:.18,fillColor:"#ffd2a0",fillIntensity:.55,backColor:"#ff9a5e",backIntensity:.5,waterShallow:"#d3bd93",waterDeep:"#5f7383",cloudOpacity:.8,selfLit:.8,stars:.15},sl={top:"#141f3a",middle:"#223358",horizon:"#42598a",fog:"#1f3050",fogNearFactor:1.7,fogFarFactor:6.4,hemiSky:"#4d67a6",hemiGround:"#2b3652",hemiIntensity:.9,sunColor:"#a9bde0",sunIntensity:.32,sunAzimuth:4.4,sunElevation:.7,fillColor:"#3d5688",fillIntensity:.42,backColor:"#6b86c0",backIntensity:.45,waterShallow:"#27415e",waterDeep:"#101f33",cloudOpacity:.55,selfLit:1,stars:1},ji=[{hour:0,preset:sl},{hour:5,preset:sl},{hour:6.5,preset:kp},{hour:8,preset:Bp},{hour:16.5,preset:Bp},{hour:18.5,preset:kp},{hour:19,preset:sl},{hour:24,preset:sl}],Uw=["top","middle","horizon","fog","hemiSky","hemiGround","sunColor","fillColor","backColor","waterShallow","waterDeep"],lu=new ge,Vp=new ge,zn={top:"",middle:"",horizon:"",fog:"",fogNearFactor:0,fogFarFactor:0,hemiSky:"",hemiGround:"",hemiIntensity:0,sunColor:"",sunIntensity:0,sunAzimuth:0,sunElevation:0,fillColor:"",fillIntensity:0,backColor:"",backIntensity:0,waterShallow:"",waterDeep:"",cloudOpacity:0,selfLit:0,stars:0};function ri(s,e,t){return s+(e-s)*t}function Nw(s){const e=(s%24+24)%24;let t=ji[0],n=ji[ji.length-1],i=0;for(let l=1;l<ji.length;l+=1)if(e>=ji[l-1].hour&&e<=ji[l].hour){t=ji[l-1],n=ji[l];const c=n.hour-t.hour||1;i=(e-t.hour)/c;break}const r=t.preset,a=n.preset,o=l=>{lu.set(r[l]),Vp.set(a[l]),lu.lerp(Vp,i),zn[l]=`#${lu.getHexString()}`};return Uw.forEach(o),zn.fogNearFactor=ri(r.fogNearFactor,a.fogNearFactor,i),zn.fogFarFactor=ri(r.fogFarFactor,a.fogFarFactor,i),zn.hemiIntensity=ri(r.hemiIntensity,a.hemiIntensity,i),zn.sunIntensity=ri(r.sunIntensity,a.sunIntensity,i),zn.sunAzimuth=ri(r.sunAzimuth,a.sunAzimuth,i),zn.sunElevation=ri(r.sunElevation,a.sunElevation,i),zn.fillIntensity=ri(r.fillIntensity,a.fillIntensity,i),zn.backIntensity=ri(r.backIntensity,a.backIntensity,i),zn.cloudOpacity=ri(r.cloudOpacity,a.cloudOpacity,i),zn.selfLit=ri(r.selfLit,a.selfLit,i),zn.stars=ri(r.stars,a.stars,i),zn}const Hp=8,zw=48,Fw=16,Ow=`
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
`,Bw=`
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
`,Gp=[{color1:[.1,.9,.3],color2:[.1,.7,.6],color3:[.3,.3,.9],alpha:1,tilt:.1},{color1:[.15,.8,.4],color2:[.2,.5,.8],color3:[.6,.2,.7],alpha:.8,tilt:.15},{color1:[.2,.6,.9],color2:[.4,.3,.8],color3:[.7,.15,.5],alpha:.6,tilt:-.08},{color1:[.05,.95,.35],color2:[.1,.85,.55],color3:[.15,.5,.75],alpha:.7,tilt:.2}];class kw{constructor(e,t){F(this,"group",new Xt);F(this,"timeUniforms",[]);F(this,"alphaUniforms",[]);F(this,"baseAlphas",[]);F(this,"materials",[]);F(this,"geometries",[]);F(this,"night",0);this.group.renderOrder=-5;const n=t*3.4,i=t*.55,r=t*.5;for(let a=0;a<Hp;a+=1){const o=Gp[a%Gp.length],l=a/Hp*Math.PI*2,c=new ni(r,i,zw,Fw),h={value:a*7.3},d={value:o.alpha},u=new gt({vertexShader:Ow,fragmentShader:Bw,uniforms:{uTime:h,uAlpha:d,uColor1:{value:new L(...o.color1)},uColor2:{value:new L(...o.color2)},uColor3:{value:new L(...o.color3)}},transparent:!0,depthWrite:!1,blending:Jn,side:rn,fog:!1}),f=new $e(c,u);f.position.set(e.x+Math.cos(l)*n,t*1.05,e.z+Math.sin(l)*n),f.rotation.y=Math.PI/2-l,f.rotation.z=o.tilt,this.group.add(f),this.timeUniforms.push(h),this.alphaUniforms.push(d),this.baseAlphas.push(o.alpha),this.materials.push(u),this.geometries.push(c)}this.group.visible=!1}setNight(e){this.night=e,this.group.visible=e>.02}reset(){for(const e of this.timeUniforms)e.value=0}update(e){for(let t=0;t<this.timeUniforms.length;t+=1)this.timeUniforms[t].value+=e,this.alphaUniforms[t].value=this.baseAlphas[t]*this.night*.8}dispose(){this.group.removeFromParent(),this.geometries.forEach(e=>e.dispose()),this.materials.forEach(e=>e.dispose())}}class Vw{constructor(e,t,n,i){F(this,"material");F(this,"mesh");F(this,"timeU",{value:0});F(this,"phase");F(this,"drift");F(this,"radius");F(this,"speed");F(this,"night",0);this.center=e,this.terrainHeight=i,this.phase=n*Math.PI*2,this.radius=.55+n*.45,this.speed=.1+n*.08,this.drift={x:Math.cos(t),z:Math.sin(t)};const r=60+n*40,a=new fn(11,2.6,r,20,10,!0).translate(0,r/2,0);this.material=new Dt({color:14481151,transparent:!0,opacity:0,depthWrite:!1,side:rn,fog:!0}),this.material.defines={USE_UV:""},this.material.onBeforeCompile=o=>{o.uniforms.time=this.timeU,o.vertexShader=o.vertexShader.replace("#include <common>",`#include <common>
uniform float time;`).replace("#include <begin_vertex>",`#include <begin_vertex>
          // 扭转 + 摆动（参考 WaterSpouts 的顶点注入）
          float twist = uv.y * 5.0 + time * 0.6;
          float s = sin(twist);
          float c = cos(twist);
          transformed.xz = mat2(c, -s, s, c) * transformed.xz;
          transformed.x += sin(time * 1.7 + uv.y * 3.2) * 2.4 * uv.y;
          transformed.z += cos(time * 1.4 + uv.y * 3.9) * 2.4 * uv.y;`)},this.mesh=new $e(a,this.material),this.mesh.name="city-sea-spout",this.mesh.position.set(e.x,0,e.z)}update(e,t){this.timeU.value+=e;const n=(t*this.speed+this.phase)%(Math.PI*2),i=Math.max(0,Math.sin(n));this.material.opacity=.38*i*(1-this.night*.8),this.mesh.visible=i>.03;const r=t*.03+this.phase,a=this.center.x+Math.cos(r)*18+this.drift.x*Math.sin(t*.05+this.phase)*30,o=this.center.z+Math.sin(r)*18+this.drift.z*Math.sin(t*.05+this.phase)*30;this.mesh.position.set(a,this.terrainHeight(a,o),o),this.mesh.rotation.y=t*.5+this.phase}reset(){this.timeU.value=0}dispose(){this.mesh.geometry.dispose(),this.material.dispose(),this.mesh.removeFromParent()}}class Hw{constructor(e,t,n){F(this,"group",new Xt);F(this,"envelope");F(this,"baseY");F(this,"rise");F(this,"sway");F(this,"t");F(this,"t0");F(this,"spawn");F(this,"geometries",[]);F(this,"materials",[]);this.t=n*120,this.t0=this.t,this.spawn={...e},this.rise=1.6+n*1.4,this.sway=.4+n*.6,this.baseY=70+n*40;const i=new Dn(9,14,12).scale(1,1.18,1),r=new ht({color:t});this.envelope=new $e(i,r),this.envelope.position.y=10,this.envelope.castShadow=!0;const a=new mt(3.4,2.6,3.4),o=new ht({color:"#8a6a4c"}),l=new $e(a,o),c=new mt(3,5.2,3),h=new ht({color:"#5d5648",transparent:!0,opacity:.55}),d=new $e(c,h);d.position.y=3.6,this.group.add(this.envelope,l,d),this.group.position.set(e.x,this.baseY,e.z),this.group.name="city-hot-air-balloon",this.geometries=[i,a,c],this.materials=[r,o,h]}reset(){this.t=this.t0,this.group.position.set(this.spawn.x,this.baseY,this.spawn.z),this.group.rotation.set(0,0,0)}update(e){this.t+=e,this.group.position.y=this.baseY+Math.sin(this.t*.05*this.rise)*55,this.group.position.x+=Math.sin(this.t*.03)*.16*this.sway,this.group.position.z+=Math.cos(this.t*.026)*.14*this.sway,this.group.rotation.z=Math.sin(this.t*.11)*.05,this.group.rotation.x=Math.cos(this.t*.09)*.04}dispose(){this.geometries.forEach(e=>e.dispose()),this.materials.forEach(e=>e.dispose()),this.group.removeFromParent()}}class Gw{constructor(e,t,n,i=42){F(this,"mesh");F(this,"lanterns",[]);F(this,"night",0);F(this,"matrix",new De);F(this,"position",new L);F(this,"quaternion",new Jt);F(this,"scale",new L);F(this,"geometry");F(this,"material");const r=new Dn(1.1,8,6),a=new Dt({color:"#ffca7a",transparent:!0,opacity:0,toneMapped:!1});this.mesh=new Vt(r,a,i),this.mesh.frustumCulled=!1,this.mesh.name="city-night-lanterns",this.mesh.visible=!1;for(let o=0;o<i;o+=1){const l=Be(`lantern:${o}`);let c,h;if(n&&n.length>4&&o%2===0){const d=n[Math.floor(l*n.length)];c=d.x+(l-.5)*26,h=d.z+(Be(`lz:${o}`)-.5)*26}else{const d=l*Math.PI*2,u=t*(.9+Be(`lr:${o}`)*.5);c=e.x+Math.cos(d)*u,h=e.z+Math.sin(d)*u}this.lanterns.push({x:c,z:h,y:3+l*6,y0:3+l*6,rise:.5+Be(`lri:${o}`)*.9,drift:l*Math.PI*2,phase:l*Math.PI*2})}this.geometry=r,this.material=a}setNight(e){this.night=e,this.material.opacity=.9*e,this.mesh.visible=e>.03}reset(){for(const e of this.lanterns)e.y=e.y0}update(e,t){this.lanterns.forEach((n,i)=>{n.y+=n.rise*e*1.6,n.y>90&&(n.y=2.5);const r=Math.sin(t*.5+n.phase)*.8;this.position.set(n.x+Math.sin(t*.04+n.drift)*9,n.y+r,n.z+Math.cos(t*.05+n.drift)*9);const a=.8+.25*Math.sin(t*1.6+n.phase);this.scale.setScalar(a),this.quaternion.identity(),this.matrix.compose(this.position,this.quaternion,this.scale),this.mesh.setMatrixAt(i,this.matrix)}),this.mesh.instanceMatrix.needsUpdate=!0}dispose(){this.geometry.dispose(),this.material.dispose(),this.mesh.removeFromParent()}}class Ww{constructor(e,t,n,i){F(this,"spouts",[]);F(this,"balloons",[]);F(this,"lanterns",null);F(this,"group",new Xt);for(let a=0;a<2;a+=1){const o=a*2.4+.7;let l=t*1.55;const c=d=>{for(let u=0;u<8;u+=1){const f=u/8*Math.PI*2;if(n(e.x+Math.cos(o)*d+Math.cos(f)*50,e.z+Math.sin(o)*d+Math.sin(f)*50)>-.5)return!0}return n(e.x+Math.cos(o)*d,e.z+Math.sin(o)*d)>-.5};for(;c(l)&&l<t*6;)l+=20;const h=new Vw({x:e.x+Math.cos(o)*l,z:e.z+Math.sin(o)*l},o,Be(`spout:${a}`),n);this.spouts.push(h),this.group.add(h.mesh)}const r=["#d96a4e","#4e96b8","#d9a94e"];for(let a=0;a<3;a+=1){const o=Be(`balloon:${a}`),l=a/3*Math.PI*2+o*.9,c=t*(.5+(a*.37+o)%1*.45),h=new Hw({x:e.x+Math.cos(l)*c,z:e.z+Math.sin(l)*c},r[a],o);this.balloons.push(h),this.group.add(h.group)}this.lanterns=new Gw(e,t,i),this.group.add(this.lanterns.mesh)}setNight(e){var t;(t=this.lanterns)==null||t.setNight(e);for(const n of this.spouts)n.night=e,n.mesh.material.color.setRGB(.86,.96,1).multiplyScalar(1-e*.75)}reset(){var e;this.spouts.forEach(t=>t.reset()),this.balloons.forEach(t=>t.reset()),(e=this.lanterns)==null||e.reset()}update(e,t){var n;for(const i of this.spouts)i.update(e,t);for(const i of this.balloons)i.update(e);(n=this.lanterns)==null||n.update(e,t)}dispose(){var e;this.spouts.forEach(t=>t.dispose()),this.balloons.forEach(t=>t.dispose()),(e=this.lanterns)==null||e.dispose(),this.group.removeFromParent()}}class Xw{constructor(e,t){F(this,"bodyMesh");F(this,"wingMesh");F(this,"bodyMaterial");F(this,"wingMaterial");F(this,"flocks",[]);F(this,"offsets");F(this,"matrix",new De);F(this,"wingMatrix",new De);F(this,"birdQuaternion",new Jt);F(this,"wingQuaternion",new Jt);F(this,"flapQuaternion",new Jt);F(this,"euler",new kn);F(this,"position",new L);F(this,"scaleVector",new L);F(this,"mirror",new De().makeScale(1,1,-1));F(this,"axisX",new L(1,0,0));F(this,"center");F(this,"group",new Xt);F(this,"daylight",1);this.center={...e};const n=new Dn(.3,6,5).scale(2.4,.85,.8),i=new Gn(.3,.85,4).rotateZ(Math.PI/2).translate(-.95,.02,0).scale(1,.16,1),r=Mh([n,i]);n.dispose(),i.dispose();const a=new kf;a.moveTo(0,0),a.lineTo(-.45,1.55),a.lineTo(-1,1.9),a.lineTo(-.55,.2),a.closePath();const o=new Qc(a).rotateX(Math.PI/2);this.bodyMaterial=new ht({color:"#454b52",transparent:!0}),this.wingMaterial=new ht({color:"#3d434a",transparent:!0,side:rn}),this.offsets=[[0,0],[-.13,-.085],[-.13,.085],[-.26,-.17],[-.26,.17],[-.39,-.25],[-.39,.25]].map(([c,h])=>[c*30,h*30]);const l=this.offsets.length*2;this.bodyMesh=new Vt(r,this.bodyMaterial,l),this.bodyMesh.name="city-birds",this.wingMesh=new Vt(o,this.wingMaterial,l*2),this.wingMesh.name="city-bird-wings",this.bodyMesh.frustumCulled=!1,this.wingMesh.frustumCulled=!1,this.wingMesh.instanceMatrix.setUsage(Hi),this.group.add(this.bodyMesh,this.wingMesh);for(let c=0;c<2;c+=1){const h=Be(`flock:${c}`);this.flocks.push({orbit:h*Math.PI*2,radius:t*(.35+h*.4),altitude:70+h*50,speed:(.05+h*.018)*(c===0?1:-1),phase:h*7,bob:.55+h*.4})}}setDaylight(e){this.daylight=e,this.bodyMaterial.opacity=.92*e,this.wingMaterial.opacity=.92*e,this.group.visible=e>.05}update(e,t){if(!this.group.visible)return;let n=0;for(const i of this.flocks){const r=i.orbit+t*i.speed;for(const[a,o]of this.offsets){const l=r-Math.sign(i.speed)*a/i.radius,c=this.center.x+Math.cos(l)*(i.radius+o*Math.sin(l)),h=this.center.z+Math.sin(l)*(i.radius+o*-Math.cos(l)),d=Math.sin(t*8.5+i.phase+a*1.9+o*3.1),f=.12+(.1+.85*(.25+.75*(.5+.5*Math.sin(t*.31+i.phase+o))))*d;this.position.set(c,i.altitude+d*i.bob,h),this.euler.set(d*.12,-r-Math.sign(i.speed)*Math.PI/2,d*.18),this.birdQuaternion.setFromEuler(this.euler),this.scaleVector.setScalar(3*(.92+d*.06)),this.matrix.compose(this.position,this.birdQuaternion,this.scaleVector),this.bodyMesh.setMatrixAt(n,this.matrix),this.flapQuaternion.setFromAxisAngle(this.axisX,f),this.wingQuaternion.copy(this.birdQuaternion).multiply(this.flapQuaternion),this.wingMatrix.compose(this.position,this.wingQuaternion,this.scaleVector),this.wingMesh.setMatrixAt(n*2,this.wingMatrix),this.flapQuaternion.setFromAxisAngle(this.axisX,-f),this.wingQuaternion.copy(this.birdQuaternion).multiply(this.flapQuaternion),this.wingMatrix.compose(this.position,this.wingQuaternion,this.scaleVector),this.wingMatrix.multiply(this.mirror),this.wingMesh.setMatrixAt(n*2+1,this.wingMatrix),n+=1}}this.bodyMesh.instanceMatrix.needsUpdate=!0,this.wingMesh.instanceMatrix.needsUpdate=!0}dispose(){this.bodyMesh.geometry.dispose(),this.wingMesh.geometry.dispose(),this.bodyMaterial.dispose(),this.wingMaterial.dispose(),this.group.removeFromParent()}}const Wp=`
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
`,Yw=`
uniform float uTime;
uniform float uOpacity;
varying vec3 vPos;
${Wp}
void main() {
  float n = noise3(vPos * 2.2 + uTime * 3.0);
  float crack = smoothstep(0.35, 0.6, n);
  vec3 rock = vec3(0.08, 0.03, 0.01);
  vec3 lava = mix(vec3(1.0, 0.2, 0.0), vec3(1.0, 0.9, 0.2), crack);
  gl_FragColor = vec4(mix(rock, lava, crack * 0.8 + 0.2), uOpacity);
}
`,qw=`
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
${Wp}
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
`;class Zw{constructor(e,t={x:0,z:0}){F(this,"pool",[]);F(this,"trailMaterial");F(this,"headMaterial");F(this,"glowMaterial");F(this,"geometries",[]);F(this,"timeU",{value:0});F(this,"countdown",3);F(this,"interval",1.2);F(this,"night",0);F(this,"spawnCount",0);F(this,"group",new Xt);this.radius=e,this.center=t;const n=new Gn(2.4,70,16,4,!0).rotateX(-Math.PI/2).translate(0,0,-35),i=new Mo(2.2,1),r=i.attributes.position;for(let o=0;o<r.count;o+=1){const l=1+(Be(`meteor-rock:${o}`)-.5)*.1;r.setXYZ(o,r.getX(o)*l,r.getY(o)*l,r.getZ(o)*l)}i.computeVertexNormals();const a=new Dn(5.5,12,8);this.geometries.push(n,i,a),this.trailMaterial=new gt({vertexShader:`varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,fragmentShader:qw,uniforms:{uTime:this.timeU,uOpacity:{value:1}},transparent:!0,depthWrite:!1,side:rn,fog:!1}),this.headMaterial=new gt({vertexShader:`varying vec3 vPos;
void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,fragmentShader:Yw,uniforms:{uTime:this.timeU,uOpacity:{value:1}},transparent:!0,fog:!1}),this.glowMaterial=new Dt({color:"#ffba73",transparent:!0,opacity:.35,depthWrite:!1,blending:Jn,toneMapped:!1,fog:!1});for(let o=0;o<3;o+=1){const l=new Xt,c=new $e(n,this.trailMaterial);c.renderOrder=335;const h=new $e(i,this.headMaterial);h.renderOrder=340;const d=new $e(a,this.glowMaterial);d.renderOrder=330;for(const u of[c,h,d])u.frustumCulled=!1;l.add(c,d,h),l.visible=!1,this.group.add(l),this.pool.push({mesh:l,active:!1,life:0,span:2.6,velocity:new L})}}reset(){this.countdown=3,this.spawnCount=0,this.timeU.value=0;for(const e of this.pool)e.active=!1,e.life=0,e.mesh.visible=!1}setNight(e,t){this.night=e;const n=Math.floor(t/864e5),i=Be(`meteor-night:${n}`)<.3;this.interval=i?1.35:7.5}update(e){this.timeU.value+=e;const t=this.night>.55;if(this.group.visible=t,!t){for(const n of this.pool)n.mesh.visible=!1;return}if(this.countdown-=e,this.countdown<=0){const n=this.pool.find(i=>!i.active);if(n){const i=Be(`meteor-spawn:${this.spawnCount}`);this.spawnCount+=1;const r=this.radius*(1.15+i*.5),a=i*Math.PI*2;n.mesh.position.set(this.center.x+Math.cos(a)*r,560+i*220,this.center.z+Math.sin(a)*r),n.velocity.set(-Math.cos(a)*150-60,-95-i*45,-Math.sin(a)*150+40).normalize().multiplyScalar(230+i*70),n.span=2.2+i*1.1,n.life=0,n.active=!0,n.mesh.visible=!0}this.countdown=this.interval*(.7+Be(`meteor-gap:${this.spawnCount}`)*.6)}for(const n of this.pool){if(!n.active)continue;n.life+=e;const i=n.life/n.span;if(i>=1){n.active=!1,n.mesh.visible=!1;continue}n.mesh.position.addScaledVector(n.velocity,e);const r=Math.sin(i*Math.PI);n.mesh.scale.setScalar(.5+r*.8),n.mesh.lookAt(n.mesh.position.clone().add(n.velocity))}}dispose(){this.geometries.forEach(e=>e.dispose()),this.trailMaterial.dispose(),this.headMaterial.dispose(),this.glowMaterial.dispose(),this.group.removeFromParent()}}class $w{constructor(e){F(this,"puffs");F(this,"material");F(this,"lifeAttr");F(this,"nightU",{value:0});F(this,"glow");F(this,"glowMaterial");F(this,"crater");F(this,"wind",new L(4.2,0,2.6));F(this,"ages",[]);F(this,"spans",[]);F(this,"group",new Xt);this.crater=new L(e.center.x,e.height/2,e.center.z);const t=new ni(1,1);this.lifeAttr=new os(new Float32Array(11),1),t.setAttribute("aLife",this.lifeAttr),this.material=new gt({transparent:!0,depthWrite:!1,uniforms:{uOpacity:{value:1},uNight:this.nightU},vertexShader:`
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
        }`}),this.puffs=new Vt(t,this.material,11),this.puffs.frustumCulled=!1,this.puffs.onBeforeRender=(n,i)=>{i.overrideMaterial&&(this.puffs.count=0)},this.puffs.onAfterRender=()=>{this.puffs.count=11},this.puffs.name="city-volcano-plume";for(let n=0;n<11;n+=1){const i=8+n%4*1.3+Be(`puffspan:${n}`)*.6;this.spans.push(i),this.ages.push((n/11+Be(`puff:${n}`)*.04)*i)}this.glowMaterial=new Dt({color:"#ff5a2e",transparent:!0,opacity:0,blending:Jn,depthWrite:!1,fog:!1,toneMapped:!1}),this.glow=new $e(new Dn(4.5,8,6),this.glowMaterial),this.glow.position.copy(this.crater),this.group.add(this.puffs,this.glow)}setNight(e){this.glowMaterial.opacity=e*.3,this.nightU.value=e}reset(){for(let e=0;e<this.ages.length;e+=1)this.ages[e]=(e/11+Be(`puff:${e}`)*.04)*this.spans[e]}update(e){const t=new De,n=new L,i=new L;for(let r=0;r<this.ages.length;r+=1){this.ages[r]=(this.ages[r]+Math.min(e,.5))%this.spans[r];const a=this.ages[r]/this.spans[r],o=a*58;n.copy(this.crater).addScaledVector(this.wind,a*this.spans[r]),n.y+=o;const l=Math.sin(r*2.399)*a*14;n.x+=l*.8,n.z+=Math.cos(r*2.399)*a*14*.8;const c=9+a*34;i.set(c,c,1),this.lifeAttr.setX(r,a),t.compose(n,new Jt,i),this.puffs.setMatrixAt(r,t)}this.puffs.instanceMatrix.needsUpdate=!0,this.lifeAttr.needsUpdate=!0}dispose(){this.puffs.geometry.dispose(),this.material.dispose(),this.glow.geometry.dispose(),this.glowMaterial.dispose(),this.group.removeFromParent()}}class Kw{constructor(e,t=130){F(this,"material");F(this,"timeU",{value:0});F(this,"nightU",{value:0});F(this,"points");const n=[];for(let o=0;o<t&&o<e.length;o+=1){const l=e[o%e.length];n.push({...l,seed:Be(`fireflyphase:${o}`)})}const i=new Float32Array(n.length*3),r=new Float32Array(n.length);n.forEach((o,l)=>{i[l*3]=o.x+(o.seed-.5)*6,i[l*3+1]=o.y+1.4+o.seed*2.2,i[l*3+2]=o.z+(Be(`fireflyz:${l}`)-.5)*6,r[l]=o.seed*Math.PI*2});const a=new At;a.setAttribute("position",new Ot(i,3)),a.setAttribute("aPhase",new Ot(r,1)),this.material=new gt({transparent:!0,depthWrite:!1,blending:Jn,uniforms:{uTime:this.timeU,uNight:this.nightU},vertexShader:`
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
        }`}),this.points=new Ef(a,this.material),this.points.name="city-fireflies",this.points.frustumCulled=!1}setNight(e){this.nightU.value=Math.max(0,Math.min(1,(e-.06)/.2))*(1-e*.35)}update(e,t){this.timeU.value=t}dispose(){this.points.geometry.dispose(),this.material.dispose(),this.points.removeFromParent()}}class Jw{constructor(e,t,n=220){F(this,"mesh");F(this,"material");F(this,"walkers",[]);F(this,"matrix",new De);F(this,"quaternion",new Jt);F(this,"euler",new kn);F(this,"position",new L);F(this,"scaleVector",new L);F(this,"color",new ge);F(this,"ground");F(this,"group",new Xt);this.ground=t;const i=new fn(.26,.34,1.35,5).translate(0,.68,0),r=new Dn(.21,6,5).translate(0,1.58,0),a=Mh([i,r]);i.dispose(),r.dispose(),this.material=new ht({color:"#ffffff"}),this.mesh=new Vt(a,this.material,Math.max(1,n)),this.mesh.name="city-pedestrians",this.mesh.instanceMatrix.setUsage(Hi),this.mesh.frustumCulled=!1;const o=["#d8d3c8","#b8c4cc","#c9a08a","#8f9aa4","#d9b48a","#7f8b94","#c8ccd0"];let l=0;e.forEach((c,h)=>{if(c.length<3||l>=n)return;const d=c.reduce((g,v)=>g+v.x,0)/c.length,u=c.reduce((g,v)=>g+v.z,0)/c.length,f=c.map(g=>{const v=d-g.x,M=u-g.z,x=Math.hypot(v,M)||1;return{x:g.x+v/x*3.2,z:g.z+M/x*3.2}}),m=[0];for(let g=1;g<=f.length;g+=1){const v=f[g-1],M=f[g%f.length];m.push(m[g-1]+Math.hypot(M.x-v.x,M.z-v.z))}const _=m[m.length-1];if(_<40)return;const p=Math.min(16,Math.max(6,Math.round(_/55)));for(let g=0;g<p&&l<n;g+=1){const v=Be(`ped:${h}:${g}`);this.walkers.push({points:f,cumulative:m,total:_,distance:v*_,speed:(v>.5?1:-1)*(1.15+Be(`peds:${h}:${g}`)*.75),phase:Be(`pedp:${h}:${g}`)*Math.PI*2}),this.mesh.setColorAt(l,this.color.set(o[Math.floor(Be(`pedc:${h}:${g}`)*o.length)])),l+=1}}),this.mesh.count=l}update(e,t){if(this.walkers.length){for(let n=0;n<this.walkers.length;n+=1){const i=this.walkers[n],r=((i.distance+i.speed*t)%i.total+i.total)%i.total;let a=1;for(;a<i.cumulative.length-1&&i.cumulative[a]<r;)a+=1;const o=i.points[a-1],l=i.points[a%i.points.length],c=i.cumulative[a]-i.cumulative[a-1]||1,h=(r-i.cumulative[a-1])/c,d=o.x+(l.x-o.x)*h,u=o.z+(l.z-o.z)*h,f=Math.abs(Math.sin(t*6+i.phase))*.05;this.position.set(d,this.ground(d,u)+f,u),this.euler.set(0,Math.atan2(-(l.z-o.z),l.x-o.x),0),this.quaternion.setFromEuler(this.euler),this.scaleVector.set(1,1,1),this.matrix.compose(this.position,this.quaternion,this.scaleVector),this.mesh.setMatrixAt(n,this.matrix)}this.mesh.instanceMatrix.needsUpdate=!0}}dispose(){this.mesh.geometry.dispose(),this.material.dispose(),this.group.removeFromParent()}get object3d(){return this.mesh}}class jw{constructor(e,t,n,i,r,a){F(this,"birds");F(this,"meteors");F(this,"volcano");F(this,"fireflies");F(this,"pedestrians");F(this,"group",new Xt);this.birds=new Xw(e,t),this.group.add(this.birds.group),this.meteors=new Zw(t,e),this.group.add(this.meteors.group);const o=[...i].sort((l,c)=>c.height-l.height)[0];this.volcano=o?new $w(o):null,this.volcano&&this.group.add(this.volcano.group),this.fireflies=n.length?new Kw(n):null,this.fireflies&&this.group.add(this.fireflies.points),this.pedestrians=r.length?new Jw(r,a):null,this.pedestrians&&this.group.add(this.pedestrians.object3d)}setNight(e,t){var n,i;this.birds.setDaylight(1-e),this.meteors.setNight(e,t),(n=this.volcano)==null||n.setNight(e),(i=this.fireflies)==null||i.setNight(e)}reset(){var e;this.meteors.reset(),(e=this.volcano)==null||e.reset()}update(e,t){var n,i,r;this.birds.update(e,t),this.meteors.update(e),(n=this.volcano)==null||n.update(e),(i=this.fireflies)==null||i.update(e,t),(r=this.pedestrians)==null||r.update(e,t)}dispose(){var e,t,n;this.birds.dispose(),this.meteors.dispose(),(e=this.volcano)==null||e.dispose(),(t=this.fireflies)==null||t.dispose(),(n=this.pedestrians)==null||n.dispose(),this.group.removeFromParent()}}const Xp=.82,Qw=.62;function eb(s){const e=s-new Date(s).getTimezoneOffset()*6e4,t=Math.floor(e/864e5),n=e/36e5%24,i=Be(`weather:${(Math.imul(t,2654435761)^2654435769)>>>0}`),r=i<Qw?"clear":i<Xp?"overcast":"rain",a=Math.max(0,Math.min(1,Math.min(n/1.5,(24-n)/1.5))),o=Be(`rainphase:${t}`)*100,l=Math.sin(n*3.7+o*1.7)*.5+.5,c=Math.sin(n*1.6+o*3.1)*.5+.5,h=l*.65+c*.35,d=Math.max(0,Math.min(1,(h-.5)/.08)),u=.25+.75*d*d*(3-2*d),f=r==="clear"?0:r==="rain"?a*u:a,m=r==="clear"?0:a*(r==="rain"?1:.72),_=Be(`weather:${(Math.imul(t-1,2654435761)^2654435769)>>>0}`)>=Xp,p=Math.max(0,Math.min(1,(n-6)/1.5)),g=_&&Be(`bow:${t}`)<.5?p*Math.max(0,Math.min(1,(11-n)/2.5)):0;return{kind:r,intensity:f,overcast:m,rainbow:g}}const cu=50,tb=.09;function Ms(s){const e=Math.sin(s*127.1+311.7)*43758.5453;return e-Math.floor(e)}class nb{constructor(){F(this,"mesh");F(this,"uniforms");F(this,"streaks",Array.from({length:cu},()=>({x:0,y:0,speed:0,length:0,width:0,angle:0,active:!1})));F(this,"amount",0);F(this,"spawnCount",0);F(this,"frame",0);F(this,"matrix",new De);F(this,"position",new L);F(this,"quaternion",new Jt);F(this,"scale",new L);F(this,"zAxis",new L(0,0,1));this.uniforms={uOpacity:{value:0},uAspect:{value:1}};const e=new gt({transparent:!0,depthTest:!1,depthWrite:!1,side:rn,blending:Jn,uniforms:this.uniforms,vertexShader:`
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
        }`});this.mesh=new Vt(new ni(1,1),e,cu),this.mesh.name="city-rain",this.mesh.renderOrder=90,this.mesh.frustumCulled=!1,this.mesh.visible=!1,this.mesh.count=0}setAspect(e,t){this.uniforms.uAspect.value=Math.max(.2,e/Math.max(1,t))}setAmount(e){if(this.amount=e,this.uniforms.uOpacity.value=e*.35,this.mesh.visible=e>.02,!this.mesh.visible)for(const t of this.streaks)t.active=!1}reset(){this.spawnCount=0,this.frame=0;for(const e of this.streaks)e.active=!1}spawn(e){const t=this.spawnCount*6;this.spawnCount+=1,e.angle=-.35+(Ms(t)-.5)*2*tb,e.length=.08+Ms(t+1)*.14,e.width=.0015+Ms(t+2)*.0015,e.speed=1.8+Ms(t+3)*1.4,e.x=(Ms(t+4)-.5)*2.6,e.y=1.15+Ms(t+5)*.3,e.active=!0}update(e,t,n){if(!this.mesh.visible)return;const i=Math.min(e,.1);this.frame+=1;let r=0;for(let a=0;a<cu;a+=1){const o=this.streaks[a];if(!o.active)if(Ms(this.frame*53.7+a*1.31+.5)<this.amount*.85*i*30)this.spawn(o);else continue;if(o.x+=Math.sin(o.angle)*o.speed*i,o.y-=Math.cos(o.angle)*o.speed*i,o.y<-1.3){o.active=!1;continue}this.position.set(o.x,o.y,0),this.quaternion.setFromAxisAngle(this.zAxis,o.angle),this.scale.set(o.width/this.uniforms.uAspect.value,o.length,1),this.matrix.compose(this.position,this.quaternion,this.scale),this.mesh.setMatrixAt(r,this.matrix),r+=1}this.mesh.count=r,this.mesh.instanceMatrix.needsUpdate=!0}dispose(){this.mesh.geometry.dispose(),this.mesh.material.dispose(),this.mesh.removeFromParent()}}class ib{constructor(e){F(this,"mesh");F(this,"uniforms");this.uniforms={uOpacity:{value:0},uInner:{value:e*.78},uOuter:{value:e}};const t=new gt({transparent:!0,depthWrite:!1,side:rn,blending:ws,uniforms:this.uniforms,vertexShader:`
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
        }`}),n=new oa(e*.78,e,48,1,0,Math.PI);this.mesh=new $e(n,t),this.mesh.name="city-rainbow",this.mesh.frustumCulled=!1,this.mesh.visible=!1}set(e,t,n,i){if(this.uniforms.uOpacity.value=e*.55,this.mesh.visible=e>.02,!this.mesh.visible)return;const r=t+Math.PI;this.mesh.position.set(n.x+Math.cos(r)*i,-18,n.z+Math.sin(r)*i),this.mesh.lookAt(n.x,this.mesh.position.y,n.z)}dispose(){this.mesh.geometry.dispose(),this.mesh.material.dispose(),this.mesh.removeFromParent()}}const Yp=15,sb=19.6,rb=12e3,ab=50;class ob{constructor(e){F(this,"renderer");F(this,"scene",new l0);F(this,"camera");F(this,"controls");F(this,"assetsReady");F(this,"floraReady",Promise.resolve());F(this,"hemisphere");F(this,"sun");F(this,"raycaster",new Hg);F(this,"pointer",new pe);F(this,"parts",null);F(this,"layout",null);F(this,"model",null);F(this,"frame",0);F(this,"raf",0);F(this,"lastTime",0);F(this,"elapsed",0);F(this,"lastRenderAt",0);F(this,"disposed",!1);F(this,"documentHidden",!1);F(this,"firstFrameSent",!1);F(this,"cursorMs",null);F(this,"lastSkyHour",-1);F(this,"aurora",null);F(this,"ambient",null);F(this,"wildlife",null);F(this,"rain",null);F(this,"rainbow",null);F(this,"fillLight",null);F(this,"backLight",null);F(this,"themeSelfLit",.24);F(this,"playing",!1);F(this,"playbackSpeed",3600);F(this,"lastActivityAt",0);F(this,"qualityMode","auto");F(this,"quality",0);F(this,"frameCount",0);F(this,"lastStatsAt",0);F(this,"fps",60);F(this,"softwareRenderer",!1);F(this,"surfaceDirty",!0);F(this,"qualityDirty",!0);F(this,"surfaceWidth",0);F(this,"surfaceHeight",0);F(this,"surfacePixelRatio",0);F(this,"lastSurfaceChangeAt",0);F(this,"contextLost",!1);F(this,"lowFpsWindows",0);F(this,"highFpsWindows",0);F(this,"lastTierChangeAt",0);F(this,"upgradeAfter",0);F(this,"tween",null);F(this,"pointerClient",null);F(this,"pointerMoved",!1);F(this,"hoveredId",null);F(this,"pointerDown",null);F(this,"attracted",!0);F(this,"boundsRadius",150);F(this,"cityCenter",{x:0,z:0});F(this,"disposablesSky",[]);F(this,"observers",[]);F(this,"skyDome",null);F(this,"assets",null);F(this,"dayMix",0);F(this,"seed",null);F(this,"composer",null);F(this,"composerKey","");F(this,"mirror",null);F(this,"mirrorMatrix",new De);F(this,"cinematic",null);F(this,"exportSize",null);F(this,"tick",e=>{var i,r;if(this.disposed||(this.raf=requestAnimationFrame(this.tick),this.documentHidden)||this.softwareRenderer&&!this.surfaceDirty&&!this.qualityDirty&&e-this.lastRenderAt<1e3/15)return;const t=Math.min(.1,Math.max(.001,(e-this.lastTime)/1e3));this.lastTime=e,this.elapsed+=t,this.noteActivityIfNeeded();const n=e-this.lastActivityAt>rb&&!this.tween&&!this.playing;n&&!this.surfaceDirty&&!this.qualityDirty&&e-this.lastRenderAt<ab||(this.updateScene(t),this.renderFrame(),this.lastRenderAt=e,this.accountFrame(e,n),!this.firstFrameSent&&this.model&&(this.firstFrameSent=!0,(r=(i=this.options).onFirstFrame)==null||r.call(i)))});this.options=e;const t=e.canvas,n={antialias:e.headless||window.devicePixelRatio<1.75,powerPreference:"low-power",stencil:!1};this.renderer=new oy({canvas:t,...n});const i=this.renderer.getContext(),r=i.getExtension("WEBGL_debug_renderer_info");this.softwareRenderer=!!r&&/swiftshader|llvmpipe|software|softpipe/i.test(String(i.getParameter(r.UNMASKED_RENDERER_WEBGL))),this.renderer.toneMapping=Pa,this.renderer.toneMappingExposure=xt().exposure,this.renderer.shadowMap.enabled=!0,this.renderer.shadowMap.type=Tr,this.camera=new yn(42,1,1.5,8e3),this.camera.position.set(150,120,170),this.controls=e.headless?{target:new L,enabled:!1,enableDamping:!1,dampingFactor:0,maxPolarAngle:1.42,minDistance:16,maxDistance:900,autoRotate:!1,autoRotateSpeed:0,update:()=>(this.camera.lookAt(this.controls.target),!1),dispose:()=>{}}:new cy(this.camera,t),this.controls.enableDamping=!0,this.controls.dampingFactor=.08,this.controls.maxPolarAngle=1.42,this.controls.minDistance=16,this.controls.maxDistance=900,this.controls.autoRotate=!1,this.controls.autoRotateSpeed=.45;const a=xt();if(this.scene.background=new ge(a.skyHorizon),this.hemisphere=new wg(a.hemiSky,a.hemiGround,a.hemiIntensity),this.scene.add(this.hemisphere),this.sun=new Ro(a.sunColor,a.sunIntensity),this.sun.position.set(120,160,70),this.sun.castShadow=!0,this.sun.shadow.mapSize.set(1024,1024),this.sun.shadow.camera.near=20,this.sun.shadow.camera.far=620,this.sun.shadow.bias=-6e-4,this.sun.shadow.radius=1,this.sun.shadow.normalBias=.6,this.scene.add(this.sun,this.sun.target),this.skyDome=this.buildSkyDome(),this.scene.add(this.skyDome),this.assetsReady=eS().then(v=>{var M;this.disposed||!v||(this.assets=v,this.applySkyImage(),(M=this.parts)==null||M.applyAssets(v))}),this.applyQualityLevel(0),this.upgradeAfter=performance.now()+6e4,e.headless)return;const o=t,l=v=>{this.pointerClient={x:v.clientX,y:v.clientY};const M=o.getBoundingClientRect();this.pointer.set((v.clientX-M.left)/M.width*2-1,-((v.clientY-M.top)/M.height)*2+1),this.pointerMoved=!0,this.noteActivity()},c=v=>{this.pointerDown={x:v.clientX,y:v.clientY,at:performance.now()},this.cinematic&&this.stopCinematic(),this.attracted&&(this.attracted=!1,this.controls.autoRotate=!1),this.noteActivity()},h=v=>{const M=this.pointerDown;this.pointerDown=null,this.noteActivity(),!(!M||Math.hypot(v.clientX-M.x,v.clientY-M.y)>7||performance.now()-M.at>500)&&this.handleClick()},d=()=>{this.attracted=!1,this.noteActivity()},u=()=>{this.documentHidden=document.visibilityState==="hidden",this.documentHidden?this.stopLoop():this.startLoop()};o.addEventListener("pointermove",l),o.addEventListener("pointerdown",c),o.addEventListener("pointerup",h),o.addEventListener("wheel",d,{passive:!0}),document.addEventListener("visibilitychange",u);const f=()=>{this.documentHidden=!0,this.stopLoop()},m=()=>{this.documentHidden=!1,this.noteActivity(),this.startLoop()};window.addEventListener("__AV_PLUGIN_SUSPENDED__",f),window.addEventListener("__AV_PLUGIN_RESUMED__",m),this.observers.push(()=>{window.removeEventListener("__AV_PLUGIN_SUSPENDED__",f),window.removeEventListener("__AV_PLUGIN_RESUMED__",m)}),this.observers.push(()=>o.removeEventListener("pointermove",l),()=>o.removeEventListener("pointerdown",c),()=>o.removeEventListener("pointerup",h),()=>o.removeEventListener("wheel",d),()=>document.removeEventListener("visibilitychange",u));const _=new ResizeObserver(()=>{this.surfaceDirty=!0});_.observe(o.parentElement??o);const p=v=>{v.preventDefault(),this.contextLost=!0,this.stopLoop()},g=()=>{this.contextLost=!1,this.surfaceWidth=0,this.surfaceDirty=this.qualityDirty=!0,this.documentHidden||this.startLoop()};t.addEventListener("webglcontextlost",p),t.addEventListener("webglcontextrestored",g),this.observers.push(()=>{_.disconnect(),t.removeEventListener("webglcontextlost",p),t.removeEventListener("webglcontextrestored",g)}),this.startLoop()}noteActivity(){this.lastActivityAt=performance.now()}renderMirror(){const e=this.parts;if(!e)return;if(this.quality<1){e.setMirror(null,null);return}const t=this.renderer.getDrawingBufferSize(new pe),n=Math.max(256,Math.floor(t.x/2)),i=Math.max(256,Math.floor(t.y/2));if(this.mirror){const a=this.mirror.getRenderTarget();(a.width!==n||a.height!==i)&&a.setSize(n,i)}else{const a=new Vo(new ni(1,1),{textureWidth:n,textureHeight:i,clipBias:.003});a.rotation.x=-Math.PI/2,a.position.y=e.water.position.y,a.updateMatrixWorld(),this.mirror=a}e.water.visible=!1,this.mirror.onBeforeRender(this.renderer,this.scene,this.camera,void 0,void 0,void 0),e.water.visible=!0;const r=this.mirror.material.uniforms.textureMatrix.value;this.mirrorMatrix.copy(r).multiply(new De().copy(this.mirror.matrixWorld).invert()),e.setMirror(this.mirror.getRenderTarget().texture,this.mirrorMatrix)}renderFrame(){var i;this.flushSurface(),this.renderMirror();const e=this.quality>=1,t=this.quality>=1;if(!e&&!t){this.renderer.render(this.scene,this.camera);return}const n=`${e?"ao":""}|${t?"bloom":""}|${this.quality}`;if(!this.composer||this.composerKey!==n){(i=this.composer)==null||i.dispose();const r=this.renderer.getSize(new pe),a=new Ey(this.renderer);if(a.addPass(new Cy(this.scene,this.camera)),e){const o=Math.random;let l=2654435769;Math.random=()=>{l=l+1831565813|0;let h=Math.imul(l^l>>>15,1|l);return h=h+Math.imul(h^h>>>7,61|h)^h,((h^h>>>14)>>>0)/4294967296};let c;try{c=new xi(this.scene,this.camera,r.x,r.y)}finally{Math.random=o}c.updateGtaoMaterial({radius:14,distanceExponent:1,thickness:8,distanceFallOff:1,scale:2.4,samples:this.quality>=2?16:10}),c.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:6,rings:2,samples:this.quality>=2?16:8}),c.blendIntensity=1,a.addPass(c)}t&&a.addPass(new rr(new pe(r.x,r.y),1,.6,2)),a.addPass(new Py),a.setPixelRatio(this.renderer.getPixelRatio()),a.setSize(r.x,r.y),this.composer=a,this.composerKey=n}this.composer.render()}resize(){var l,c;const e=this.options.canvas,t=this.options.headless?null:e.parentElement,n=((l=this.exportSize)==null?void 0:l.width)??Math.max(1,(t==null?void 0:t.clientWidth)??(this.options.headless?e.width:e.clientWidth)),i=((c=this.exportSize)==null?void 0:c.height)??Math.max(1,(t==null?void 0:t.clientHeight)??(this.options.headless?e.height:e.clientHeight)),r=this.quality>=2?2:this.quality===1?1.5:1,a=this.exportSize||this.options.headless?1:Math.min(window.devicePixelRatio||1,r,this.softwareRenderer?Math.min(640/n,360/i):1/0);if(n===this.surfaceWidth&&i===this.surfaceHeight&&a===this.surfacePixelRatio)return;const o=a!==this.surfacePixelRatio;if(this.surfaceWidth=n,this.surfaceHeight=i,this.surfacePixelRatio=a,this.lastSurfaceChangeAt=performance.now(),this.renderer.setDrawingBufferSize(n,i,a),this.composer&&(o&&this.composer.setPixelRatio(a),this.composer.setSize(n,i)),this.camera.aspect=n/i,this.camera.updateProjectionMatrix(),this.layout&&this.attracted){const h=this.homeView();this.camera.position.set(h.x,h.y,h.z),this.controls.target.set(this.cityCenter.x,6,this.cityCenter.z)}}async prepareExportAssets(){await Promise.all([this.assetsReady,this.floraReady])}photoView(){return{position:this.camera.position.toArray(),target:this.controls.target.toArray(),fov:this.camera.fov,elapsed:this.elapsed,cursorMs:this.cursorMs}}restorePhotoView(e){var t,n;this.attracted=!1,this.tween=null,this.playing=!1,this.elapsed=e.elapsed,this.cursorMs=e.cursorMs,this.camera.position.fromArray(e.position),this.controls.target.fromArray(e.target),this.camera.fov=e.fov,this.camera.updateProjectionMatrix(),(n=this.parts)==null||n.applyCursor(e.cursorMs??((t=this.model)==null?void 0:t.windowEndMs)??Date.now(),e.cursorMs===null),this.updateScene(0)}setSeed(e){if(e===this.seed)return;const t=this.seed===null;this.seed=e,this.layout=null,this.model&&this.applyModel(this.model,!1),t||this.resetView()}applyModel(e,t=!0){var d,u,f,m,_;if(this.model=e,this.seed===null)return;const n=this.parts?this.parts.displaySnapshot():null;this.parts&&(this.scene.remove(this.parts.group,this.parts.water),this.parts.dispose(),this.parts=null);const i=Sw(e,t?this.layout:null,this.seed);this.layout=i,this.parts=new Dw(e,i,n),this.assets&&this.parts.applyAssets(this.assets),this.parts.setSkyMix(this.dayMix),this.lastSkyHour=-1;const r=this.parts;this.floraReady=n1(i.biome).then(p=>{this.parts===r&&!this.disposed&&r.applyFlora(p)}),this.scene.add(this.parts.group,this.parts.water),this.cityCenter={x:(i.urbanBounds.left+i.urbanBounds.right)/2,z:(i.urbanBounds.north+i.urbanBounds.south)/2},(d=this.aurora)==null||d.dispose(),this.aurora=new kw(this.cityCenter,Math.max(120,i.boundsRadius)*.6),this.scene.add(this.aurora.group),(u=this.ambient)==null||u.dispose(),this.ambient=new Ww(this.cityCenter,Math.max(120,i.boundsRadius)*.6,i.terrain.height,i.river),this.scene.add(this.ambient.group),(f=this.wildlife)==null||f.dispose();const a=[],o=(p,g)=>Math.max(0,i.terrain.height(p,g));for(const p of i.publicSites)if(p.kind==="park")for(let g=0;g<48;g+=1){const v=g*2.399,M=p.radius*.85*Math.sqrt((g+.5)/48),x=p.x+Math.cos(v)*M,w=p.z+Math.sin(v)*M;a.push({x,z:w,y:o(x,w)})}for(const p of i.gardens??[])for(let g=0;g<14;g+=1){const v=g*2.399,M=Math.min(p.width,p.depth)*.45*Math.sqrt((g+.5)/14),x=p.x+Math.cos(v)*M,w=p.z+Math.sin(v)*M;a.push({x,z:w,y:p.y})}a.push(...i.parkTrees??[]),this.wildlife=new jw(this.cityCenter,Math.max(120,i.boundsRadius),a,i.seaMountains??[],i.districts.flatMap(p=>p.carPaths),o),this.scene.add(this.wildlife.group),this.fillLight||(this.fillLight=new Ro("#cfe8ef",.35),this.backLight=new Ro("#ffffff",.15),this.scene.add(this.fillLight,this.backLight));const l=Math.max(100,Math.hypot(i.urbanBounds.right-i.urbanBounds.left,i.urbanBounds.south-i.urbanBounds.north)/2+35);this.boundsRadius=l,this.controls.maxDistance=l*4.5,this.scene.fog=new Br(new ge(xt().fog),l*2.1,l*7.5);const c=l*.85+24,h=this.sun.shadow.camera;if(this.placeSun(),h.far=this.sunDistance()+c*2,h.left=-c,h.right=c,h.top=c,h.bottom=-c,h.updateProjectionMatrix(),this.attracted){const p=this.homeView();this.flyTo(p,{...this.cityCenter,y:6},900)}this.parts.setLabelsVisible(!0),this.parts.setQualityLevel(this.quality),this.cursorMs!==null&&this.parts.applyCursor(this.cursorMs,!1,this.playbackSpeed*1e3),this.parts.snapToTargets(),!this.options.headless&&!this.firstFrameSent&&!this.contextLost&&(this.updateScene(0),this.renderFrame(),this.lastRenderAt=performance.now(),this.firstFrameSent=!0,(_=(m=this.options).onFirstFrame)==null||_.call(m))}sunDistance(){return Math.max(900,this.boundsRadius*2.2)}placeSun(){const e=xt(),t=Wa.degToRad(e.sunAzimuthDeg),n=Wa.degToRad(e.sunElevationDeg),i=this.sunDistance();this.sun.position.set(this.cityCenter.x+Math.cos(t)*Math.cos(n)*i,Math.sin(n)*i,this.cityCenter.z+Math.sin(t)*Math.cos(n)*i),this.sun.target.position.set(this.cityCenter.x,0,this.cityCenter.z),this.sun.target.updateMatrixWorld()}homeView(){const e=Math.max(120,this.boundsRadius),t=1.2*Math.max(1,1/this.camera.aspect);return{x:this.cityCenter.x+e*.86*t,y:e*1.05*t,z:this.cityCenter.z+e*1.16*t}}flyTo(e,t,n){this.tween={fromPos:this.camera.position.clone(),toPos:new L(e.x,e.y,e.z),fromTarget:this.controls.target.clone(),toTarget:new L(t.x,t.y,t.z),start:this.elapsed,duration:n/1e3}}resetView(){var t,n,i;const e=this.homeView();this.flyTo(e,{...this.cityCenter,y:6},900),(n=(t=this.options).onSelect)==null||n.call(t,null),(i=this.parts)==null||i.setSelected(null)}focusBuilding(e){if(!this.parts)return!1;const t=this.parts.anchorFor(e);if(!t)return!1;this.attracted=!1;const n=Math.max(26,t.height*2.1),i=new L().subVectors(this.camera.position,this.controls.target).setY(0).normalize();i.lengthSq()<.01&&i.set(.8,0,.6).normalize();const r=new L(t.x,t.ground,t.z).addScaledVector(i,n).add(new L(0,n*.62,0));return this.flyTo(r,{x:t.x,y:t.ground+Math.max(4,t.height*.45),z:t.z},850),!0}focusDistrict(e){if(!this.parts)return!1;const t=this.parts.districtAnchor(e);if(!t)return!1;this.attracted=!1;const n=t.radius*2.6,i=new L().subVectors(this.camera.position,this.controls.target).setY(0).normalize();i.lengthSq()<.01&&i.set(.8,0,.6).normalize();const r=new L(t.x,t.y,t.z).addScaledVector(i,n).add(new L(0,n*.7,0));return this.flyTo(r,{x:t.x,y:t.y,z:t.z},900),!0}setQualityMode(e){e!==this.qualityMode&&(this.qualityMode=e,this.lowFpsWindows=this.highFpsWindows=0,e==="high"?this.applyQualityLevel(2):e==="eco"?this.applyQualityLevel(0):this.applyQualityLevel(0))}applyQualityLevel(e){this.quality===e&&!this.exportSize||(this.quality=e,this.qualityDirty=this.surfaceDirty=!0)}flushSurface(){var e,t;if(this.qualityDirty){this.qualityDirty=!1;const n=this.quality;this.renderer.shadowMap.enabled=n>=1;const i=n>=2?4096:2048;this.sun.shadow.mapSize.x!==i&&(this.sun.shadow.mapSize.set(i,i),(e=this.sun.shadow.map)==null||e.dispose(),this.sun.shadow.map=null),(t=this.parts)==null||t.setQualityLevel(n)}this.resize(),this.surfaceDirty=!1}setLabelsVisible(e){var t;(t=this.parts)==null||t.setLabelsVisible(e)}get overflowCount(){var e;return(((e=this.layout)==null?void 0:e.massing)??[]).reduce((t,n)=>t+n.count,0)}setSelected(e){var t;(t=this.parts)==null||t.setSelected(e)}setTimeCursor(e,t){var n,i;this.cursorMs=e,(t==null?void 0:t.playing)!==void 0&&(this.playing=t.playing),(t==null?void 0:t.speed)!==void 0&&(this.playbackSpeed=t.speed),e!==null?(n=this.parts)==null||n.applyCursor(e,!1,this.playbackSpeed*1e3):this.model&&((i=this.parts)==null||i.applyCursor(this.model.windowEndMs,!0)),this.noteActivity()}get isPlaying(){return this.playing}handleClick(){var t,n,i,r;if(!this.parts)return;const e=this.pick();e?(this.parts.setSelected(e),this.focusBuilding(e),(n=(t=this.options).onSelect)==null||n.call(t,e)):(this.parts.setSelected(null),(r=(i=this.options).onSelect)==null||r.call(i,null))}pick(){if(!this.parts||!this.pointerClient)return null;this.raycaster.setFromCamera(this.pointer,this.camera);const e=this.raycaster.intersectObjects(this.parts.raycastTargets,!1);for(const t of e){if(t.instanceId===void 0)continue;const n=this.parts.idAt(t.object,t.instanceId);if(n)return n}return null}applyDayMix(e){var r,a,o;const t=(l,c,h)=>{const d=Math.min(1,Math.max(0,(h-l)/(c-l)));return d*d*(3-2*d)},n=t(6,8,e)*(1-t(16,18.5,e)),i=(a=(r=this.skyDome)==null?void 0:r.material)==null?void 0:a.uniforms;i&&(i.uDayMix.value=n),this.dayMix=n,(o=this.parts)==null||o.setSkyMix(n)}applySkyImage(){var t,n;const e=(n=(t=this.skyDome)==null?void 0:t.material)==null?void 0:n.uniforms;!e||!this.assets||(e.uSky.value=this.assets.sky.dusk,e.uSkyDay.value=this.assets.sky.day,e.uHasSky.value=1)}buildSkyDome(){const e=new Dn(6e3,24,14),t=new gt({side:xn,depthWrite:!1,fog:!1,uniforms:{topColor:{value:new ge(xt().skyTop)},midColor:{value:new ge(xt().skyMid)},horizonColor:{value:new ge(xt().skyHorizon)},uSky:{value:null},uHasSky:{value:0},uSkyDay:{value:null},uDayMix:{value:0},uGradeTop:{value:new ge(xt().skyGrade.top)},uGradeHorizon:{value:new ge(xt().skyGrade.horizon)},uGradeAmount:{value:xt().skyGrade.amount},uSkyYaw:{value:_h(xt())},uStars:{value:0},uSkyDim:{value:1},uNight:{value:0},uOvercast:{value:0}},vertexShader:`
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
      `}),n=new $e(e,t);return n.renderOrder=-10,this.disposablesSky.push(e,t),n}startLoop(){this.options.headless||this.disposed||this.contextLost||this.raf||(this.lastTime=performance.now(),this.lastStatsAt=0,this.raf=requestAnimationFrame(this.tick))}diagnosticState(){return{firstFrame:this.firstFrameSent,contextLost:this.contextLost,loopScheduled:!!this.raf,modelApplied:!!this.model,frameAgeMs:Math.round(performance.now()-this.lastRenderAt),width:this.renderer.domElement.width,height:this.renderer.domElement.height}}stopLoop(){this.raf&&cancelAnimationFrame(this.raf),this.raf=0}noteActivityIfNeeded(){(this.controls.autoRotate||this.tween)&&(this.lastActivityAt=performance.now())}startCinematic(e="full"){var i,r;if(!this.layout||!this.model||!this.parts)return null;const t=s1(this.layout,this.model,this.parts.anchors(),{cut:e});this.tween=null,this.playing=!1,this.attracted=!1,this.controls.autoRotate=!1,this.controls.enabled=!1;const n=(this.model.windowEndMs-this.model.windowStartMs)/Math.max(1,t.durationSec);return(i=this.rainbow)==null||i.set(0,0,this.cityCenter,1),(r=this.rain)==null||r.setAmount(0),this.cinematic={plan:t,startedAt:this.elapsed,savedFov:this.camera.fov,look:null,lastSeconds:0,pace:n},this.camera.fov=38,this.camera.updateProjectionMatrix(),this.parts.setLabelsVisible(!1),this.parts.setScaffoldVisible(!1),this.parts.applyCursor(t.cursor(0),!1,n),this.noteActivity(),t}stopCinematic(){var t,n,i,r,a,o,l,c;const e=this.cinematic;e&&(this.cinematic=null,this.controls.enabled=!0,this.camera.fov=e.savedFov,(t=this.parts)==null||t.setScaffoldVisible(!0),this.camera.updateProjectionMatrix(),this.cursorMs=null,(i=this.parts)==null||i.applyCursor(((n=this.model)==null?void 0:n.windowEndMs)??Date.now(),!0),(o=(a=this.options).onTimeCursor)==null||o.call(a,((r=this.model)==null?void 0:r.windowEndMs)??Date.now(),!0),(c=(l=this.options).onCinematic)==null||c.call(l,0,e.plan,!0))}async renderFilm(e){var l,c,h,d,u,f,m,_;if(!this.layout||!this.model||!this.parts)throw new Error("city not ready");if(typeof VideoEncoder>"u"||typeof VideoFrame>"u")throw new Error("WebCodecs unavailable");let t=null;for(const p of["avc1.640028","avc1.420028"]){const g={codec:p,width:e.width,height:e.height,bitrate:e.bitrate,framerate:e.fps,latencyMode:"realtime",avc:{format:"avc"}};if((await VideoEncoder.isConfigSupported(g)).supported){t=g;break}}if(!t)throw new Error("mp4_encoder_unavailable");this.stopLoop();const n=this.quality,i=this.elapsed;let r=null,a=null,o=!1;try{this.exportSize={width:e.width,height:e.height},this.applyQualityLevel(n),this.elapsed=0,this.lastSkyHour=Number.NaN,this.parts.resetAnimation(),(l=this.ambient)==null||l.reset(),(c=this.aurora)==null||c.reset(),(h=this.wildlife)==null||h.reset(),(d=this.rain)==null||d.reset();const p=this.startCinematic(e.cut);if(!p)throw new Error("cinematic unavailable");const g=gr(e.width,e.height),v=eu(g);a=new pw(e.fps,e.width,e.height),await a.start();let M=null,x=0;r=new VideoEncoder({output:(P,D)=>{if(x+=P.byteLength,x>(e.maxEncodedBytes??256*1024*1024)){M=new Error("export_memory_limit");return}a.addChunk(P,D)},error:P=>{M=P}}),r.configure(t);const w=1/e.fps;let S=0;const A=p.durationSec+4,y=Math.ceil(A*e.fps),T=async()=>{var D;const P=this.options.headless?Math.max(80,Math.min(5e3,S*4)):16;if(await new Promise(U=>setTimeout(U,P)),(D=e.signal)!=null&&D.aborted||this.disposed)throw new DOMException("aborted","AbortError")};(u=e.onProgress)==null||u.call(e,0,y),await T(),this.updateScene(0);for(let P=0;P<3;P+=1){await T();const D=performance.now();this.renderFrame(),S=performance.now()-D}for(let P=0;P<y;P+=1){if(await T(),(f=e.signal)!=null&&f.aborted)throw new DOMException("aborted","AbortError");if(M)throw M;const D=performance.now();this.elapsed+=w,this.updateScene(w),this.renderFrame(),v.drawImage(this.options.canvas,0,0,e.width,e.height),a1(v,{width:e.width,height:e.height,seconds:P*w,durationSec:A,cards:p.cards,describe:e.describe,watermark:e.watermark,letterbox:e.letterbox}),(m=e.onFrame)==null||m.call(e,g,P);const U=new VideoFrame(g,{timestamp:Math.round(P*w*1e6),duration:Math.round(w*1e6)});for(r.encode(U,{keyFrame:P%(e.fps*2)===0}),U.close(),S=performance.now()-D;r.encodeQueueSize>6;)await T();await a.drain(),(_=e.onProgress)==null||_.call(e,P+1,y)}if(await r.flush(),M)throw M;const C=await a.finish();return o=!0,C}finally{try{r==null||r.close()}catch{}if(!o)try{await(a==null?void 0:a.cancel())}catch{}this.stopCinematic(),this.exportSize=null,this.elapsed=i,this.disposed||(this.applyQualityLevel(n),this.startLoop())}}async capturePhoto(e={}){if(!this.parts)throw new Error("city not ready");const t=e.width??2560,n=e.height??1440,i=this.softwareRenderer?Math.min(1,640/t,360/n):1,r=Math.max(1,Math.round(t*i)),a=Math.max(1,Math.round(n*i)),o=this.quality,l=this.camera.aspect;this.stopLoop();const c=this.parts.hideOverlaysForPhoto();this.exportSize={width:r,height:a},this.applyQualityLevel(this.softwareRenderer?0:this.options.headless?o:2);try{this.options.headless&&await new Promise(f=>setTimeout(f,80));const h=performance.now();this.renderFrame(),this.options.headless&&await new Promise(f=>setTimeout(f,Math.max(80,Math.min(5e3,(performance.now()-h)*4)))),this.renderFrame();const d=gr(r,a),u=eu(d);if(u.drawImage(this.options.canvas,0,0,r,a),e.watermark){const f=a/1080;u.save(),u.globalAlpha=.6,u.fillStyle="#fff",u.shadowColor="rgba(0,0,0,0.5)",u.shadowBlur=8*f,u.textAlign="right",u.font=`600 ${Math.round(16*f)}px system-ui, -apple-system, 'Segoe UI', 'PingFang SC', sans-serif`,u.fillText(e.watermark,r-28*f,a-24*f),u.restore()}return typeof document>"u"?await d.convertToBlob({type:"image/png"}):await new Promise((f,m)=>d.toBlob(_=>_?f(_):m(new Error("PNG encode failed")),"image/png"))}finally{c(),this.exportSize=null,this.applyQualityLevel(o),this.camera.aspect=l,this.camera.updateProjectionMatrix(),this.startLoop()}}get isCinematic(){return this.cinematic!==null}updateCinematic(){var l,c,h,d,u,f,m;const e=this.cinematic;if(!e)return!1;const t=this.elapsed-e.startedAt,n=Math.min(t,e.plan.durationSec);(l=this.parts)==null||l.setLabelsVisible(!1),(c=this.parts)==null||c.setScaffoldVisible(!1);const i=e.plan.position(n);this.layout&&(i.y=Math.max(i.y,Math.max(0,this.layout.terrain.height(i.x,i.z))+6)),this.camera.position.copy(i);const r=e.plan.target(n),a=Math.max(0,t-e.lastSeconds);e.lastSeconds=t,e.look?e.look.lerp(r,1-Math.exp(-a/.35)):e.look=r.clone(),this.controls.target.copy(e.look),this.camera.lookAt(e.look);const o=e.plan.cursor(n);return(h=this.parts)==null||h.applyCursor(o,!1,e.pace),(u=(d=this.options).onTimeCursor)==null||u.call(d,o,!1),(m=(f=this.options).onCinematic)==null||m.call(f,t,e.plan,!1),this.lastActivityAt=performance.now(),t>e.plan.durationSec+4&&this.stopCinematic(),!0}updateDaylight(){let e;if(this.cinematic)e=Yp+(sb-Yp)*Math.min(1,this.cinematic.lastSeconds/this.cinematic.plan.durationSec);else{const n=this.cursorMs!==null?new Date(this.cursorMs):new Date;e=n.getHours()+n.getMinutes()/60+n.getSeconds()/3600}if(Math.abs(e-this.lastSkyHour)<(this.cinematic?5e-4:.02))return;this.lastSkyHour=e,this.applyDayMix(e);const t=Nw(e);this.applySky(t),this.cinematic||this.applyWeather(this.cursorMs??Date.now())}applyWeather(e){var d,u,f;const t=eb(e),n=t.overcast;this.rain||(this.rain=new nb,this.scene.add(this.rain.mesh)),this.rainbow||(this.rainbow=new ib(Math.max(90,this.boundsRadius*.35)),this.scene.add(this.rainbow.mesh)),this.rain.setAspect(this.renderer.domElement.width,this.renderer.domElement.height),this.rain.setAmount(t.kind==="rain"?t.intensity*.8:0);const i=Math.atan2(this.sun.position.z-this.cityCenter.z,this.sun.position.x-this.cityCenter.x);this.rainbow.set(t.rainbow,i,this.cityCenter,Math.max(240,this.boundsRadius*.85));const r=(u=(d=this.skyDome)==null?void 0:d.material)==null?void 0:u.uniforms;if(r&&(r.uOvercast.value=Math.min(.85,n*.85)),n<=.001&&t.rainbow<=.001)return;const a=new ge("#9aa3ab"),o=new ge("#aeb6bc"),l=new ge("#3c4a54"),c=(f=this.skyDome)==null?void 0:f.material;c&&(c.uniforms.topColor.value.lerp(a,.5*n),c.uniforms.midColor.value.lerp(a,.5*n),c.uniforms.horizonColor.value.lerp(o,.55*n)),this.scene.background.lerp(o,.5*n);const h=this.scene.fog;if(h instanceof Br&&(h.color.lerp(o,.5*n),h.near*=1-.5*n,h.far*=1-.45*n),this.sun.intensity*=1-.55*n,this.hemisphere.intensity*=1+.18*n,this.fillLight&&(this.fillLight.intensity*=1-.3*n),this.backLight&&(this.backLight.intensity*=1-.3*n),this.parts){const m=this.parts.cloudMaterial;m&&(m.opacity=Math.min(1,m.opacity+.55*n));const _=this.parts.waterColors;_&&(_.uShallow.value.lerp(l,.35*n),_.uDeep.value.lerp(l,.35*n))}}applySky(e){var o,l,c,h,d,u;const t=(o=this.skyDome)==null?void 0:o.material;if(!t)return;const n=t.uniforms;n.topColor.value.set(e.top),n.midColor.value.set(e.middle),n.horizonColor.value.set(e.horizon),n.uStars.value=e.stars,n.uSkyDim.value=.22+.78*Math.min(1,e.sunIntensity/1.2);const i=1-Math.min(1,Math.max(0,(e.sunIntensity-.32)/(.95-.32)));n.uNight.value=i*i*(3-2*i),(l=this.parts)==null||l.setNightWater(n.uNight.value),n.uOvercast.value=0,this.scene.background.set(e.fog);const r=this.scene.fog;if(r&&r instanceof Br){r.color.set(e.fog);const f=Math.max(120,this.boundsRadius);r.near=f*e.fogNearFactor,r.far=f*e.fogFarFactor}this.hemisphere.color.set(e.hemiSky),this.hemisphere.groundColor.set(e.hemiGround),this.hemisphere.intensity=e.hemiIntensity,this.sun.color.set(e.sunColor),this.sun.intensity=e.sunIntensity,this.fillLight&&this.backLight&&(this.fillLight.color.set(e.fillColor),this.fillLight.intensity=e.fillIntensity,this.backLight.color.set(e.backColor),this.backLight.intensity=e.backIntensity);const a=320;if(this.sun.position.set(this.cityCenter.x+Math.cos(e.sunAzimuth)*Math.cos(e.sunElevation)*a,Math.sin(e.sunElevation)*a,this.cityCenter.z+Math.sin(e.sunAzimuth)*Math.cos(e.sunElevation)*a),this.parts){const f=this.parts.waterColors;if(f){f.uShallow.value.set(e.waterShallow),f.uDeep.value.set(e.waterDeep);const _=this.layout?Kd[this.layout.biome]:null;if(_!=null&&_.water){const p={h:0,s:0,l:0};new ge(e.waterShallow).getHSL(p);const g=Math.min(1,p.l*2.2);f.uShallow.value.lerp(new ge(_.water.shallow),_.waterAmount*g),f.uDeep.value.lerp(new ge(_.water.deep),_.waterAmount*g)}f.uSky.value.set(e.fog)}const m=this.parts.cloudMaterial;m&&(m.opacity=e.cloudOpacity),(c=this.aurora)==null||c.setNight(e.stars),(h=this.ambient)==null||h.setNight(e.stars),(u=this.wildlife)==null||u.setNight(e.stars,this.cinematic?((d=this.model)==null?void 0:d.windowEndMs)??0:this.cursorMs??Date.now()),this.parts.setNightGlow(e.selfLit),this.parts.applySelfLit(this.themeSelfLit),this.parts.setNightWater(n.uNight.value)}}updateScene(e){var t,n,i,r,a,o,l,c,h,d,u,f,m,_;if(this.updateDaylight(),(t=this.aurora)==null||t.update(e),(n=this.ambient)==null||n.update(e,this.elapsed),(i=this.wildlife)==null||i.update(e,this.elapsed),this.cinematic?(r=this.rain)==null||r.setAmount(0):(a=this.rain)==null||a.update(e,this.elapsed,this.camera),this.updateCinematic()){(o=this.parts)==null||o.update(e,this.elapsed);return}if(this.playing&&this.model){const p=(this.cursorMs??this.model.windowStartMs)+e*1e3*this.playbackSpeed;p>=this.model.windowEndMs?(this.cursorMs=this.model.windowEndMs,this.playing=!1):this.cursorMs=p,(l=this.parts)==null||l.applyCursor(this.cursorMs,!1,this.playbackSpeed*1e3),(h=(c=this.options).onTimeCursor)==null||h.call(c,this.cursorMs,!1)}if(this.tween){const p=Math.min(1,(this.elapsed-this.tween.start)/this.tween.duration),g=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;this.camera.position.lerpVectors(this.tween.fromPos,this.tween.toPos,g),this.controls.target.lerpVectors(this.tween.fromTarget,this.tween.toTarget,g),p>=1&&(this.tween=null)}if(this.controls.update(),this.layout){const p=Math.max(0,this.layout.terrain.height(this.camera.position.x,this.camera.position.z))+3;this.camera.position.y<p&&(this.camera.position.y=p)}if((d=this.parts)==null||d.update(e,this.elapsed),this.parts&&this.pointerClient&&(this.pointerMoved||this.tween)){this.pointerMoved=!1;const p=this.pick();p!==this.hoveredId&&(this.hoveredId=p,this.parts.setHovered(p)),p?(f=(u=this.options).onHover)==null||f.call(u,p,this.pointerClient.x,this.pointerClient.y):(_=(m=this.options).onHover)==null||_.call(m,null,0,0)}}accountFrame(e,t){var n,i,r;if(this.frameCount+=1,this.lastStatsAt===0){this.lastStatsAt=e,this.frameCount=0;return}if(e-this.lastStatsAt>1e3){const a=this.frameCount*1e3/Math.max(1,e-this.lastStatsAt);this.fps=a,this.frameCount=0,this.lastStatsAt=e,(r=(i=this.options).onStats)==null||r.call(i,{fps:Math.round(a),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,buildings:((n=this.model)==null?void 0:n.buildings.length)??0,quality:this.quality,idle:t}),this.maybeRetier(a,t)}}maybeRetier(e,t){if(this.qualityMode!=="auto"||t||this.surfaceDirty||performance.now()-this.lastSurfaceChangeAt<2e3){this.lowFpsWindows=this.highFpsWindows=0;return}const n=performance.now();if(this.lowFpsWindows=e<27?this.lowFpsWindows+1:0,this.highFpsWindows=e>55?this.highFpsWindows+1:0,!(n-this.lastTierChangeAt<12e3)){if(this.lowFpsWindows>=3&&this.quality>0)this.applyQualityLevel(this.quality-1),this.upgradeAfter=n+6e4;else if(this.highFpsWindows>=8&&n>=this.upgradeAfter&&this.quality<2)this.applyQualityLevel(this.quality+1);else return;this.lastTierChangeAt=n,this.lowFpsWindows=this.highFpsWindows=0}}dispose(){var e,t,n,i,r,a,o;this.disposed=!0,this.stopLoop(),this.observers.forEach(l=>l()),this.parts&&(this.scene.remove(this.parts.group,this.parts.water),this.parts.dispose(),this.parts=null),(e=this.composer)==null||e.dispose(),this.composer=null,(t=this.mirror)==null||t.dispose(),this.mirror=null,this.controls.dispose(),(n=this.aurora)==null||n.dispose(),this.aurora=null,(i=this.ambient)==null||i.dispose(),this.ambient=null,(r=this.wildlife)==null||r.dispose(),this.wildlife=null,(a=this.rain)==null||a.dispose(),this.rain=null,(o=this.rainbow)==null||o.dispose(),this.rainbow=null,this.disposablesSky.forEach(l=>l.dispose()),this.renderer.dispose()}}function lb(s,e,t){const n=t==="en",i=s.stats.tokensTotal.toLocaleString(n?"en-US":"zh-CN"),r=n?s.windowLabel.replace(/^最近 (\d+) 天$/,"Last $1 days").replace(/^(\d+) 天$/,"$1 days"):s.windowLabel;return e.kind==="title"?{eyebrow:"AGENT VITALS",title:n?`${s.stats.renderedSessions} sessions, one city`:`${s.stats.renderedSessions} 个会话，一座城市`,subtitle:`${r} · ${i} tokens`}:e.kind==="district"?{eyebrow:n?"Harness districts":"执行环境城区",title:e.text,subtitle:`${e.detail??""}${n?" sessions":" 个会话"}`}:{title:i,subtitle:`${s.districts.length}${n?" districts · Loaded tokens · Not a bill":" 个城区 · 已载入的 token · 非费用账单"}`}}const vr=s=>self.postMessage(s);vr({type:"ready"});let qp=!1,hu=!1;self.onmessage=async s=>{var n,i;if(((n=s.data)==null?void 0:n.type)==="preview-ack"){hu=!1;return}if(qp||((i=s.data)==null?void 0:i.type)!=="start")return;qp=!0;let e=null;const t=setInterval(()=>vr({type:"pulse"}),500);try{const r=s.data.job;if(!Number.isInteger(r.seed)||r.seed<1||r.seed>4294967295||!Number.isInteger(r.width)||r.width<1||r.width>1920||!Number.isInteger(r.height)||r.height<1||r.height>1080||!Number.isInteger(r.fps)||r.fps<1||r.fps>30||!Number.isFinite(r.bitrate)||r.bitrate<1||r.bitrate>12e6||!["short","full"].includes(r.cut))throw new Error("invalid_export_job");if(typeof OffscreenCanvas>"u"||typeof VideoEncoder>"u"||typeof VideoFrame>"u")throw new Error("background_export_unavailable");const a=new OffscreenCanvas(r.width,r.height),o=a.getContext("webgl2",{powerPreference:"low-power",antialias:!0});if(!o)throw new Error("background_webgl_unavailable");const l=o.getExtension("WEBGL_debug_renderer_info"),c=l?String(o.getParameter(l.UNMASKED_RENDERER_WEBGL)):"",h=/swiftshader|llvmpipe|software|softpipe/i.test(c);h&&(r.width>640||r.height>360)&&(r.width=640,r.height=360,a.width=640,a.height=360),vr({type:"profile",width:r.width,height:r.height,software:h}),e=new ob({canvas:a,headless:!0}),e.setSeed(r.seed),e.setQualityMode("eco"),e.applyModel(r.model,!1),await e.prepareExportAssets();let d=-1,u=-1/0;const f=new OffscreenCanvas(Math.min(640,r.width),Math.min(360,r.height)),m=f.getContext("2d"),_=await e.renderFilm({...r,letterbox:2.39,watermark:"agent-vitals",maxEncodedBytes:256*1024*1024,onFrame:(p,g)=>{if(!m||hu||performance.now()-u<500)return;m.drawImage(p,0,0,f.width,f.height);const v=f.transferToImageBitmap();hu=!0,u=performance.now(),self.postMessage({type:"preview",bitmap:v,frame:g},{transfer:[v]})},describe:p=>lb(r.model,p,r.locale==="en"?"en":"zh-Hans"),onProgress:(p,g)=>{const v=Math.floor(p/g*100);(v!==d||p===g)&&(d=v,vr({type:"progress",frame:p,total:g}))}});vr({type:"complete",blob:_})}catch(r){const a=["invalid_export_job","background_export_unavailable","background_webgl_unavailable","export_memory_limit","mp4_encoder_unavailable"];vr({type:"error",code:r instanceof Error&&a.includes(r.message)?r.message:"background_export_failed"})}finally{clearInterval(t),e==null||e.dispose()}}})();
