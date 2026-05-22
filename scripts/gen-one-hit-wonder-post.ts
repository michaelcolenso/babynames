// Generates the body_html for the one-hit-wonder-names blog post using
// the real buildSparkline() function so charts match the main name pages.

import { buildSparkline } from "../packages/shared/src/sparkline";
import type { Status } from "../packages/shared/src/schema";

const YM = 1880;
const YR = 2025;

interface NameData {
  name: string;
  sex: string;
  status: Status;
  firstYear: number;
  peakYear: number;
  series: Record<number, number>;
}

const names: NameData[] = [
  {
    name: "Kunta", sex: "M", status: "extinct", firstYear: 1977, peakYear: 1977,
    series: { 1977: 215, 1978: 52, 1979: 16, 1980: 9, 1999: 5, 2000: 6 },
  },
  {
    name: "Arsenio", sex: "M", status: "endangered", firstYear: 1913, peakYear: 1989,
    series: {
      1913:6,1915:6,1916:8,1917:6,1918:7,1920:9,1921:7,1922:10,1923:6,1924:11,
      1925:10,1926:18,1927:18,1928:12,1929:9,1930:12,1931:14,1932:11,1933:13,
      1934:14,1935:12,1936:10,1937:17,1938:6,1939:6,1940:9,1941:5,1943:5,
      1948:9,1950:5,1951:8,1952:5,1953:7,1955:10,1956:12,1957:14,1958:11,
      1959:13,1960:15,1961:11,1962:15,1963:8,1964:9,1965:8,1966:11,1967:8,
      1968:12,1969:9,1970:8,1971:11,1972:14,1973:10,1974:16,1975:9,1976:15,
      1977:11,1978:13,1979:13,1980:13,1981:14,1982:12,1983:37,1984:53,
      1985:27,1986:21,1987:83,1988:124,1989:397,1990:188,1991:46,1992:47,
      1993:22,1994:15,1995:17,1996:21,1997:10,1998:18,1999:9,2000:12,
      2001:10,2002:11,2003:15,2004:7,2005:11,2006:15,2007:13,2008:24,
      2009:21,2010:15,2011:17,2012:19,2013:22,2014:25,2015:18,2016:14,
      2017:15,2018:21,2019:16,2020:17,2021:23,2022:21,2023:22,2024:16,2025:16,
    },
  },
  {
    name: "Moesha", sex: "F", status: "extinct", firstYear: 1996, peakYear: 1996,
    series: {
      1996:426,1997:211,1998:122,1999:61,2000:67,2001:61,2002:23,
      2003:36,2004:21,2005:12,2006:8,2007:8,2008:6,2014:5,
    },
  },
  {
    name: "Jkwon", sex: "M", status: "extinct", firstYear: 2004, peakYear: 2004,
    series: { 2004:100,2005:30,2006:27,2007:9,2008:7 },
  },
  {
    name: "Bethzy", sex: "F", status: "extinct", firstYear: 2005, peakYear: 2006,
    series: { 2005:11,2006:301,2007:28,2008:7,2009:13 },
  },
  {
    name: "Neymar", sex: "M", status: "declining", firstYear: 2010, peakYear: 2014,
    series: {
      2010:19,2011:190,2012:338,2013:377,2014:499,2015:294,2016:245,
      2017:199,2018:169,2019:96,2020:91,2021:98,2022:80,2023:87,2024:62,2025:53,
    },
  },
];

function chartPanel(nd: NameData): string {
  const svg = buildSparkline(nd.series, YM, YR, { status: nd.status });
  return `<div class="chart-panel">
  <div style="font-family:var(--sans);font-size:1.25rem;font-weight:800;color:#f7efe1;margin:0 0 0.2rem;letter-spacing:-0.01em">${nd.name}</div>
  <div class="chart-caption"><span>${nd.firstYear}</span><span>Peak ${nd.peakYear}</span><span>${YR}</span></div>
  ${svg}
</div>`;
}

const bodyHtml = `<p>The Social Security Administration has recorded baby names since 1880. In those 145 years, certain names arrived with a bang and left just as fast — perfect cultural timestamps, crystallized in a single year’s birth records.</p>

<p>These are the one-hit wonders: names that peaked in their debut year or within a season of some cultural event, then vanished almost as quickly. They’re not just statistics. Each one is a receipt from American pop culture.</p>

<h2>Kunta (1977): The <em>Roots</em> Effect</h2>

<p>In January 1977, ABC aired <em>Roots</em> — an eight-night miniseries about Kunta Kinte, an African man sold into slavery in America. It became one of the most-watched television events in history. That year, 215 baby boys were named Kunta. By 1979, the count had fallen to 16. By 1981, the name had effectively vanished from the record.</p>

${chartPanel(names[0]!)}

<p>What makes Kunta remarkable is the speed of the drop. Within two years of peak, the name was at 7% of its maximum. Television had created a name, and television’s news cycle had consumed it just as fast.</p>

<h2>Arsenio (1989): Late Night Makes a Name</h2>

<p>Arsenio Hall had been a recognizable name in comedy circles for years — which is why a small but steady trickle of Arsenios existed through the late 1980s. Then <em>The Arsenio Hall Show</em> launched in January 1989 and changed late-night television. That year, 397 boys received the name. Within two years it had fallen to 46 — 11.6% of its peak. By the mid-1990s, the show was cancelled and the name had faded to near-zero.</p>

${chartPanel(names[1]!)}

<h2>Moesha (1996): One Season, One Name</h2>

<p>The UPN sitcom <em>Moesha</em> starring Brandy premiered in January 1996. In that single year, 426 girls were named Moesha — a name that had essentially never existed before in SSA records. By 1999 the count had fallen to 61, about 14% of its debut-year peak. The show ran six seasons, but the naming impulse exhausted itself almost immediately. Parents named their daughters after the premiere. The reruns didn’t get another wave.</p>

${chartPanel(names[2]!)}

<h2>Jkwon (2004) and Bethzy (2006)</h2>

<p>J-Kwon’s “Tipsy” was the breakout track of early 2004 — 100 baby boys were named Jkwon that year. By 2008, the count had fallen to 7. A similarly steep shape appears for Bethzy: 11 girls in 2005, then 301 in 2006, then 28 in 2007. No widely known cultural event explains the Bethzy spike. The name spread through some channel that left no obvious record. If you have a theory, <a href="/about">reach out</a>.</p>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem">
${chartPanel(names[3]!)}
${chartPanel(names[4]!)}
</div>

<h2>Neymar: The Survivor</h2>

<p>Not every pop-culture name fades completely. Neymar, named for the Brazilian footballer, had been building since 2010 before peaking at 499 in 2014 — the year Brazil hosted the World Cup. Unlike the names above, the decline has been gradual rather than sudden: 53 boys were named Neymar in 2025, more than a decade after the peak. A lasting career produces a lasting name.</p>

${chartPanel(names[5]!)}

<p>The names that vanish fastest tend to be attached to a single event rather than a lasting career or fictional universe. A miniseries finale, a talk show cancellation, a rapper’s one hit — the cultural oxygen disappears, and the name goes with it. Khaleesi — from <em>Game of Thrones</em> — peaked in 2018 at 560 girls and still registered over 100 per year through 2022. Renesmee from <em>Twilight</em> has shown similar staying power. These names found enough genuine affection to outlast the moment that made them famous.</p>

<p>Browse the names: <a href="/name/Kunta">Kunta</a> · <a href="/name/Arsenio">Arsenio</a> · <a href="/name/Moesha">Moesha</a> · <a href="/name/Neymar">Neymar</a> · <a href="/name/Khaleesi">Khaleesi</a></p>`;

console.log(bodyHtml);
