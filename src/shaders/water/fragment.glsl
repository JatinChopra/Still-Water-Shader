uniform float uTime;
uniform vec2 uWindowSize;

uniform sampler2D uSceneTexture;
uniform sampler2D uDepthTexture;
uniform float uDistortFreq;
uniform float uDistortAmp;

uniform mat4 uInverseProjectionMatrix;
uniform mat4 uWorldMatrix;

uniform float uMaxDepth;
uniform vec3 uColor1;
uniform vec3 uColor2;

uniform sampler2D uReflectionTexture;
uniform bool uPlanarReflection;
uniform float uFresnelFactor;

uniform float uFoamDepth;
uniform sampler2D uFoamTexture;
uniform float uFoamTiling;
uniform vec3 uFoamColor;
uniform bool uSolidFoamColor;

uniform sampler2D uNormalTexture;
uniform bool uSpecularReflection;

varying vec2 vUv;



  void main(){

    // scene below the water surface
    vec2 sceneCoord = gl_FragCoord.xy / uWindowSize;
    vec2 reflectionCoord = vec2(1.0 - sceneCoord.x , sceneCoord.y);

    float offsetX = cnoise(sceneCoord*uDistortFreq+uTime)*uDistortAmp;
    float offsetY = cnoise(sceneCoord*uDistortFreq+uTime)*uDistortAmp;

    vec2 distortedCoord = vec2(sceneCoord.x+offsetX, sceneCoord.y+offsetY);
    vec2 distortedReflectionCoord = vec2(reflectionCoord.x+offsetX, reflectionCoord.y+offsetY);

    vec4 sceneBeneath = texture2D(uSceneTexture,distortedCoord);
    vec4 reflection = texture2D(uReflectionTexture,distortedReflectionCoord);

    float waterLevel = 0.0;
    float depth = texture2D(uDepthTexture,sceneCoord).r;
    
    // depth
    vec4 normalizedCoords = vec4(sceneCoord*2.0-1.0,depth*2.0-1.0,1.0);
    vec4 viewPos = uInverseProjectionMatrix * normalizedCoords;
    vec4 worldPos = uWorldMatrix * viewPos;
    viewPos /= viewPos.w;
    worldPos /= worldPos.w; 
    
    float heightDiff = 1.0 - clamp((waterLevel - worldPos.y)/uMaxDepth,0.0,1.0);
    vec3 depthColor = mix(uColor1,uColor2,heightDiff);

    // foam
    float foam = 1.0 - clamp ((waterLevel - worldPos.y)/uFoamDepth,0.0,1.0);
    float foamSpeed = 0.01;
    vec2 foamUV = vec2(vUv.x*uFoamTiling + uTime* foamSpeed , vUv.y*uFoamTiling + uTime*foamSpeed);
    float foamDensity = step(1.0 - foam,texture2D(uFoamTexture,foamUV * 5.0).r);

    vec3 normal = vec3(0.0,1.0,0.0);
    vec3 viewDir = normalize(cameraPosition - worldPos.xyz);
    float fresnel = pow(dot(viewDir,normal),uFresnelFactor);

    // for specular reflection
    vec2 normalUV1 = vec2(vUv.x*1.0+offsetX+0.5 , vUv.y*1.0+offsetY+0.2) * 2.0 -1.0;
    vec2 normalUV2 = vec2(vUv.x*1.0-offsetX+0.1 , vUv.y*1.0-offsetY+0.8) * 2.0 - 1.0;
    vec3 normalTxt1 = texture2D(uNormalTexture,normalUV1).rgb;
    vec3 normalTxt2 = texture2D(uNormalTexture,normalUV2).rgb;

    vec3 mixedNormals = mix(normalTxt1 , normalTxt2,0.8);

    vec3 lightPos = normalize(vec3(1.0,18.0,-1.0));
    vec3 reflected = normalize(reflect(lightPos,mixedNormals));
    vec3 specularColor = vec3(1.0);
    float specularDot = max(0.0, dot(viewDir,reflected));
    float specular = pow(specularDot,78.0) * (1.0 - fresnel);


    vec3 color = vec3(1.0);

    //color = sceneBeneath.rgb; 
    //color = vec3(heightDiff);
    //color = depthColor;
    //color = mix(sceneBeneath.rgb + uColor1*(1.0 - heightDiff) , sceneBeneath.rgb*0.2 + uColor2,1.0 - heightDiff);
    //color = reflection.rgb;
    //color = vec3(fresnel);
    //color = vec3(foam);
    color = mix(sceneBeneath.rgb * 0.8 + uColor1 , sceneBeneath.rgb*0.2 + uColor2,1.0 - heightDiff);

    if(uSpecularReflection){
      color = color + (specular * specularColor);
    }

    if(uPlanarReflection){
      color = mix(color,reflection.rgb*1.2,1.0 - fresnel);
    }

    if(foamDensity > 0.0)
    color = uSolidFoamColor ? uFoamColor + color : uFoamColor * (foam) + color;

    gl_FragColor = vec4(color,1.0);
  }

