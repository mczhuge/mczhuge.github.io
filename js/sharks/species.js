// Adapted from https://github.com/stackedlol/ascii-sharks
export const SPECIES = [
    {
        name: "sardine",
        cruise: 24,
        maxSpeed: 42,
        minSpeed: 12,
        weight: 3,
        schoolSize: [
            18,
            28
        ],
        spacing: [
            1.8,
            1.1
        ],
        align: 1.6,
        cohesion: 1.6,
        jitter: 24,
        mill: 32,
        verticalDrag: 0.5
    },
    {
        name: "anchovy",
        cruise: 30,
        maxSpeed: 50,
        minSpeed: 14,
        weight: 3,
        schoolSize: [
            20,
            32
        ],
        spacing: [
            1.5,
            1
        ],
        align: 3.2,
        cohesion: 0.45,
        jitter: 18,
        mill: 0,
        verticalDrag: 1.4
    },
    {
        name: "silverside",
        cruise: 26,
        maxSpeed: 46,
        minSpeed: 13,
        weight: 3,
        schoolSize: [
            12,
            20
        ],
        spacing: [
            2,
            1.1
        ],
        align: 2.4,
        cohesion: 1.1,
        jitter: 21,
        mill: 0,
        verticalDrag: 1.6
    },
    {
        name: "mackerel",
        cruise: 22,
        maxSpeed: 40,
        minSpeed: 11,
        weight: 2,
        schoolSize: [
            5,
            9
        ],
        spacing: [
            2.6,
            1.3
        ],
        align: 2,
        cohesion: 0.9,
        jitter: 15,
        mill: 0,
        verticalDrag: 2
    },
    {
        name: "goby",
        cruise: 18,
        maxSpeed: 36,
        minSpeed: 8,
        weight: 1,
        schoolSize: [
            8,
            12
        ],
        spacing: [
            1.4,
            1.1
        ],
        align: 0.35,
        cohesion: 1.4,
        jitter: 46,
        mill: 0,
        verticalDrag: 0.3
    }
];
const TOTAL_WEIGHT = SPECIES.reduce((sum, s)=>sum + s.weight, 0);
export function pickSpecies() {
    let r = Math.random() * TOTAL_WEIGHT;
    for(let i = 0; i < SPECIES.length; i++){
        r -= SPECIES[i].weight;
        if (r <= 0) return i;
    }
    return 0;
}
