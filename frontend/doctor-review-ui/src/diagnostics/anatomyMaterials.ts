import * as THREE from 'three';
const GLSL = `
varying vec3 vAnatomyPosition;
uniform float uAnatomyKind;
uniform float uAnatomyWindow;
uniform float uAnatomyCut;
uniform float uAnatomyCutY;
uniform float uAnatomyOuter;
float anatomyHash(vec3 p){p=fract(p*.3183099+vec3(.1,.3,.7));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float anatomyNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(anatomyHash(i),anatomyHash(i+vec3(1,0,0)),f.x),mix(anatomyHash(i+vec3(0,1,0)),anatomyHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(anatomyHash(i+vec3(0,0,1)),anatomyHash(i+vec3(1,0,1)),f.x),mix(anatomyHash(i+vec3(0,1,1)),anatomyHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float anatomyFbm(vec3 p){return .58*anatomyNoise(p)+.28*anatomyNoise(p*2.03)+.14*anatomyNoise(p*4.11);}
`;
export function tissueMaterial(id: string, part: string) {
    const name = part.toLowerCase();
    const vein = /vein|venous/.test(name), artery = /arter|aorta/.test(name);
    let color = '#a25b65', kind = 2, roughness = .37, coat = .28;
    if (id === 'skin') {
        color = '#a77b67';
        kind = 0;
        roughness = .57;
        coat = .04;
    }
    else if (id === 'skeleton') {
        color = '#d9cdb3';
        kind = 1;
        roughness = .58;
        coat = .04;
    }
    else if (id === 'muscles') {
        color = '#8e3e47';
        kind = 3;
        roughness = .47;
        coat = .12;
    }
    else if (id === 'vascular' || artery || vein) {
        color = vein ? '#3d6380' : '#943d42';
        kind = 4;
        roughness = .32;
        coat = .35;
    }
    else if (id === 'nervous') {
        color = '#d3b886';
        kind = 1;
        roughness = .5;
        coat = .1;
    }
    else if (id === 'heart') {
        color = /valve|septum/.test(name) ? '#c49b8d' : '#7d2e3b';
        kind = 3;
        roughness = .44;
        coat = .19;
    }
    else if (id === 'pancreas') {
        color = /duct/.test(name) ? '#e5d4bd' : '#bb8d57';
        kind = /duct/.test(name) ? 1 : 5;
        roughness = .52;
        coat = .1;
    }
    else if (id === 'liver') {
        color = '#74333e';
        kind = 2;
        roughness = .3;
        coat = .45;
    }
    else if (id === 'kidneys') {
        color = /pyramid|medulla/.test(name) ? '#8b424d' : /pelvis|calyx|calices/.test(name) ? '#ddbea0' : /cortex/.test(name) ? '#bc756b' : '#9f4d5c';
        kind = 2;
        roughness = .34;
        coat = .37;
    }
    else if (id === 'lungs') {
        color = /bronchus|bronchi|trachea/.test(name) ? '#d6b6aa' : '#ac777e';
        kind = 6;
        roughness = .56;
        coat = .12;
    }
    else if (id === 'brain') {
        color = '#bfa79e';
        kind = 2;
        roughness = .46;
        coat = .2;
    }
    const material = new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, clearcoat: coat, clearcoatRoughness: .48, ior: 1.38, specularIntensity: .38, side: THREE.DoubleSide });
    const outer = /capsule|outer_cortex|cortex|ventricle|atrium|lung.*lobe|bronchopulmonary/.test(name) || id === 'pancreas' && !/duct/.test(name) || id === 'liver' && !/duct|arter|vein|cava/.test(name);
    const uniforms = { uAnatomyKind: { value: kind }, uAnatomyWindow: { value: 0 }, uAnatomyCut: { value: 0 }, uAnatomyCutY: { value: 0 }, uAnatomyOuter: { value: outer ? 1 : 0 } };
    material.userData = { uniforms, outer, baseColor: color, part };
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'varying vec3 vAnatomyPosition;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', 'vAnatomyPosition=transformed;\n#include <project_vertex>');
        shader.fragmentShader = GLSL + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
   vec3 p=vAnatomyPosition;
   if(uAnatomyCut>.001&&uAnatomyOuter>.5&&p.y<uAnatomyCutY)discard;
   float tissueNoise=anatomyFbm(p*(uAnatomyKind==5.? .16:.28));
   float broadNoise=anatomyFbm(p*.035);
   float variability=uAnatomyKind==0.?.045:uAnatomyKind==5.?.35:.24;
   diffuseColor.rgb*=1.+(tissueNoise-.5)*variability+(broadNoise-.5)*.12;
   if(uAnatomyKind==3.){float fibres=sin(p.z*.6+p.x*.18+anatomyNoise(p*.07)*7.);diffuseColor.rgb*=1.+fibres*.045;}
   if(uAnatomyKind==2.||uAnatomyKind==3.){float fineVessels=1.-smoothstep(.009,.027,abs(anatomyFbm(p*.105)-.5));diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.65,.55,.63),fineVessels*.35);}
   if(uAnatomyKind==5.){float lobule=pow(abs(sin(p.x*.24+anatomyNoise(p*.12)*5.)*sin(p.z*.28+anatomyNoise(p*.1)*5.)),3.);diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.16,1.13,1.07),lobule*.45);}
   if(uAnatomyKind==0.&&uAnatomyWindow>.5){float windowEdge=pow(p.x/155.,2.)+pow((p.z-1110.)/240.,2.);if(windowEdge<1.&&p.y< -82.)discard;if(windowEdge<1.045&&p.y< -82.)diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.62,.44,.27),.65);}
  `);
        shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
   float tissueHeight=anatomyFbm(vAnatomyPosition*(uAnatomyKind==5.?.22:.65));
   vec3 aq0=dFdx(-vViewPosition),aq1=dFdy(-vViewPosition);
   vec3 ar1=cross(aq1,normal),ar2=cross(normal,aq0);float adet=dot(aq0,ar1);
   float amplitude=uAnatomyKind==5.?.0010:uAnatomyKind==0.?.000035:.00032;
   normal=normalize(abs(adet)*normal-sign(adet)*amplitude*(dFdx(tissueHeight)*ar1+dFdy(tissueHeight)*ar2));
  `);
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(anatomyFbm(vAnatomyPosition*.18)-.5)*.24,.22,.88);');
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `outgoingLight+=diffuseColor.rgb*pow(max(0.,dot(-normal,normalize(vec3(-.6,.5,-.8)))),3.)*.13;\n#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'anatomy-tissue-v2';
    return material;
}
