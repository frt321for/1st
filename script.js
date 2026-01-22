/**
 * DR.KUN FINAL ARCHITECTURE
 * Technique: Raymarching (Sphere Tracing)
 * Complexity: O(Pixels * Steps) - Extremely Heavy
 * Aesthetic: Monochrome, Liquid, Abstract
 */

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
container.appendChild(renderer.domElement);

const geometry = new THREE.PlaneGeometry(2, 2);

const fragmentShader = `
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_mouse;

    #define MAX_STEPS 100
    #define MAX_DIST 100.0
    #define SURF_DIST 0.001
    #define PI 3.14159265359

    mat2 rot(float a) {
        float s = sin(a);
        float c = cos(a);
        return mat2(c, -s, s, c);
    }

    float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
    }

    float hash(float n) { return fract(sin(n) * 43758.5453123); }
    float noise(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        float n = p.x + p.y * 57.0 + 113.0 * p.z;
        return mix(mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                       mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
                   mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                       mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
    }

    float fbm(vec3 p) {
        float f = 0.0;
        f += 0.5000 * noise(p); p = p * 2.02;
        f += 0.2500 * noise(p); p = p * 2.03;
        f += 0.1250 * noise(p);
        return f;
    }

    float GetDist(vec3 p) {
        vec3 p1 = p;

        p1.xz *= rot(u_time * 0.2);
        p1.xy *= rot(u_time * 0.15);

        float r1 = 1.8;
        float r2 = 0.6;

        float displacement = fbm(p1 * 2.0 + u_time * 0.5);

        float torus = length(vec2(length(p1.xz) - r1, p1.y)) - r2;

        vec3 p2 = p;
        p2.y += sin(u_time) * 1.5;
        float sphere = length(p2) - 1.0;

        float d = smin(torus, sphere, 0.8);

        d += displacement * 0.4;

        return d * 0.6;
    }

    float RayMarch(vec3 ro, vec3 rd) {
        float dO = 0.0;
        for (int i = 0; i < MAX_STEPS; i++) {
            vec3 p = ro + rd * dO;
            float dS = GetDist(p);
            dO += dS;
            if (dO > MAX_DIST || dS < SURF_DIST) break;
        }
        return dO;
    }

    vec3 GetNormal(vec3 p) {
        float d = GetDist(p);
        vec2 e = vec2(0.01, 0);
        vec3 n = d - vec3(
            GetDist(p - e.xyy),
            GetDist(p - e.yxy),
            GetDist(p - e.yyx)
        );
        return normalize(n);
    }

    float GetSoftShadow(vec3 p, vec3 lightPos) {
        vec3 l = normalize(lightPos - p);

        float shadow = 1.0;
        float t = 0.02;
        for (int i = 0; i < 50; i++) {
            float h = GetDist(p + l * t);
            if (h < 0.001) return 0.0;
            shadow = min(shadow, 8.0 * h / t);
            t += h;
            if (t > 10.0) break;
        }
        return clamp(shadow, 0.0, 1.0);
    }

    void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

        vec3 ro = vec3(0, 0, -6);
        vec3 rd = normalize(vec3(uv.x, uv.y, 1));

        float d = RayMarch(ro, rd);

        vec3 col = vec3(0.05);

        if (d < MAX_DIST) {
            vec3 p = ro + rd * d;
            vec3 n = GetNormal(p);

            vec3 lightPos = vec3(2.0, 4.0, -3.0);
            lightPos.x += u_mouse.x * 5.0;
            lightPos.y += u_mouse.y * 5.0;

            vec3 l = normalize(lightPos - p);

            float dif = clamp(dot(n, l), 0.0, 1.0);

            float shadow = GetSoftShadow(p + n * 0.01, lightPos);
            dif *= shadow;

            float fresnel = pow(1.0 + dot(rd, n), 4.0);

            vec3 baseColor = vec3(0.1);
            vec3 lightColor = vec3(1.0, 1.0, 1.0);

            col = baseColor + dif * lightColor * 0.8;
            col += fresnel * vec3(0.5, 0.6, 0.7);

            col += n.y * 0.1;
        }

        col *= 1.0 - length(uv) * 0.5;
        col = pow(col, vec3(0.4545));

        gl_FragColor = vec4(col, 1.0);
    }
`;

const uniforms = {
    u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    u_time: { value: 0 },
    u_mouse: { value: new THREE.Vector2(0, 0) }
};

const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    fragmentShader: fragmentShader,
    vertexShader: 'void main() { gl_Position = vec4( position, 1.0 ); }'
});

const plane = new THREE.Mesh(geometry, material);
scene.add(plane);

const cursor = document.getElementById('cursor');

document.addEventListener('mousemove', (e) => {
    uniforms.u_mouse.value.x = (e.clientX / window.innerWidth) * 2 - 1;
    uniforms.u_mouse.value.y = -(e.clientY / window.innerHeight) * 2 + 1;

    cursor.style.left = `${e.clientX}px`;
    cursor.style.top = `${e.clientY}px`;
});

document.addEventListener('mousedown', () => {
    gsap.to(cursor, { width: 50, height: 50, duration: 0.1 });
});

document.addEventListener('mouseup', () => {
    gsap.to(cursor, { width: 20, height: 20, duration: 0.2 });
});

const clock = new THREE.Clock();
let frameCount = 0;
let lastTime = 0;
const fpsElement = document.getElementById('fps');

function animate() {
    const time = clock.getElapsedTime();
    uniforms.u_time.value = time;

    frameCount++;
    if (time - lastTime >= 1) {
        if (fpsElement) {
            fpsElement.innerText = frameCount;
        }
        frameCount = 0;
        lastTime = time;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

window.onload = () => {
    animate();

    const tl = gsap.timeline();
    tl.to('#main-title', { opacity: 1, duration: 2, ease: 'power2.out' })
        .to('.meta', { opacity: 1, letterSpacing: '10px', duration: 2, ease: 'power2.out' }, '-=1.5');
};

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
});
