# Altirra Hardware Reference Manual

2026-01-02 Edition

Avery Lee

## Table of Contents

<table>
<tr><td>1.1. Introduction</td><td>11</td></tr>
<tr><td>1.2. Conventions in this manual</td><td>12</td></tr>
<tr><td>1.3. What's new in this edition</td><td>14</td></tr>
<tr><td>1.4. Concepts</td><td>23</td></tr>
<tr><td>2.  System Architecture</td><td>27</td></tr>
<tr><td>2.1. Basic architecture</td><td>28</td></tr>
<tr><td>2.2. Clocks</td><td>31</td></tr>
<tr><td>2.3. Memory system</td><td>32</td></tr>
<tr><td>2.4. System Reset button</td><td>33</td></tr>
<tr><td>2.5. Peripheral Interface Adapter (PIA)</td><td>34</td></tr>
<tr><td>2.6. Bank switching</td><td>36</td></tr>
<tr><td>2.7. Extended memory</td><td>37</td></tr>
<tr><td>2.8. Miscellaneous connections</td><td>39</td></tr>
<tr><td>2.9. Examples</td><td>39</td></tr>
<tr><td>2.10. Further reading</td><td>40</td></tr>
<tr><td>3.  CPU</td><td>41</td></tr>
<tr><td>3.1. Flags</td><td>42</td></tr>
<tr><td>3.2. Decimal mode</td><td>43</td></tr>
<tr><td>3.3. Cycle timing</td><td>44</td></tr>
<tr><td>3.4. Interrupts</td><td>46</td></tr>
<tr><td>3.5. Undocumented instructions</td><td>49</td></tr>
<tr><td>3.6. 65C02 compatibility</td><td>52</td></tr>
<tr><td>3.7. 65C816 compatibility</td><td>54</td></tr>
<tr><td>3.8. 65C816 new features</td><td>55</td></tr>
<tr><td>3.9. Examples</td><td>57</td></tr>
<tr><td>3.10. Further reading</td><td>58</td></tr>
<tr><td>4.  ANTIC</td><td>59</td></tr>
<tr><td>4.1. Basic operation</td><td>60</td></tr>
<tr><td>4.2. Display timing</td><td>61</td></tr>
<tr><td>4.3. Playfield</td><td>62</td></tr>
<tr><td>4.4. Character modes</td><td>63</td></tr>
<tr><td>4.5. Mapped (bitmap) modes</td><td>65</td></tr>
<tr><td>4.6. Display list</td><td>66</td></tr>
<tr><td>4.7. Scrolling</td><td>70</td></tr>
<tr><td>4.8. Non-maskable interrupts</td><td>74</td></tr>
<tr><td>4.9. WSYNC</td><td>77</td></tr>
<tr><td>4.10. VCOUNT</td><td>78</td></tr>
<tr><td>4.11. Playfield DMA</td><td>79</td></tr>
<tr><td>4.12. Abnormal playfield DMA</td><td>81</td></tr>
<tr><td>4.13. Player/missile DMA</td><td>86</td></tr>
<tr><td>4.14. Scan line timing</td><td>87</td></tr>
<tr><td>4.15. Cycle counting example</td><td>98</td></tr>
<tr><td>4.16. Examples</td><td>100</td></tr>
<tr><td>4.17. Further reading</td><td>101</td></tr>
<tr><td>5.  POKEY</td><td>102</td></tr>
<tr><td>5.1. Addressing</td><td>103</td></tr>
<tr><td>5.2. Initialization</td><td>103</td></tr>
<tr><td>5.3. Sound generation</td><td>104</td></tr>
<tr><td>5.4. Clock generation</td><td>111</td></tr>
<tr><td>5.5. Noise generators</td><td>111</td></tr>
<tr><td>5.6. Serial port</td><td>112</td></tr>
<tr><td>5.7. Interrupts</td><td>123</td></tr>
<tr><td>5.8. Keyboard scan</td><td>124</td></tr>
<tr><td>5.9. Paddle scan</td><td>129</td></tr>
<tr><td>5.10. Examples</td><td>132</td></tr>
<tr><td>5.11. Further reading</td><td>133</td></tr>
<tr><td>6.  CTIA/GTIA</td><td>134</td></tr>
<tr><td>6.1. System role</td><td>135</td></tr>
<tr><td>6.2. Display generation</td><td>136</td></tr>
<tr><td>6.3. Color encoding</td><td>142</td></tr>
<tr><td>6.4. Artifacting</td><td>144</td></tr>
<tr><td>6.5. Player/missile graphics</td><td>146</td></tr>
<tr><td>6.6. Collision detection</td><td>150</td></tr>
<tr><td>6.7. Priority control</td><td>151</td></tr>
<tr><td>6.8. High resolution modes</td><td>153</td></tr>
<tr><td>6.9. GTIA special modes</td><td>154</td></tr>
<tr><td>6.10. Cycle timing</td><td>156</td></tr>
<tr><td>6.11. General purpose I/O</td><td>158</td></tr>
<tr><td>6.12. Further reading</td><td>158</td></tr>
<tr><td>7.  Accessories</td><td>159</td></tr>
<tr><td>7.1. Joystick</td><td>160</td></tr>
<tr><td>7.2. Paddle</td><td>160</td></tr>
<tr><td>7.3. Mouse</td><td>161</td></tr>
<tr><td>7.4. Light Pen/Gun</td><td>162</td></tr>
<tr><td>7.5. CX-75 Light Pen</td><td>163</td></tr>
<tr><td>7.6. Stack Lightpen</td><td>165</td></tr>
<tr><td>7.7. CX-85 Numerical Keypad</td><td>165</td></tr>
<tr><td>7.8. CX-20 Driving Controller</td><td>166</td></tr>
<tr><td>7.9. CX-21/23/50 Keyboard Controller</td><td>166</td></tr>
<tr><td>7.10. XEP80 Interface Module</td><td>167</td></tr>
<tr><td>7.11. Corvus Disk System</td><td>181</td></tr>
<tr><td>7.12. ComputerEyes Video Acquisition System</td><td>182</td></tr>
<tr><td>8.  Cartridges</td><td>185</td></tr>
<tr><td>8.1. Cartridge slot</td><td>186</td></tr>
<tr><td>8.2. Atarimax flash cartridges</td><td>187</td></tr>
<tr><td>8.3. Atarimax MyIDE-II</td><td>188</td></tr>
<tr><td>8.4. SIC!</td><td>191</td></tr>
<tr><td>8.5. SIDE 1 / SIDE 2</td><td>191</td></tr>
<tr><td>8.6. SIDE 3</td><td>194</td></tr>
<tr><td>8.7. Corina</td><td>207</td></tr>
<tr><td>8.8. R-Time 8</td><td>208</td></tr>
<tr><td>8.9. Veronica</td><td>209</td></tr>
<tr><td>8.10. The Multiplexer</td><td>212</td></tr>
<tr><td>9.  Serial I/O (SIO) Bus</td><td>216</td></tr>
<tr><td>9.1. Basic SIO protocol</td><td>217</td></tr>
<tr><td>9.2. Poll Commands</td><td>226</td></tr>
<tr><td>9.3. 820 40 Column Printer</td><td>229</td></tr>
<tr><td>9.4. 820 Hardware</td><td>231</td></tr>
<tr><td>9.5. 1020 Color Printer</td><td>233</td></tr>
<tr><td>9.6. 1025 80 Column Printer</td><td>236</td></tr>
<tr><td>9.7. 1025 Hardware</td><td>239</td></tr>
<tr><td>9.8. 1029 Programmable Printer</td><td>242</td></tr>
<tr><td>9.9. 1029 Hardware</td><td>245</td></tr>
<tr><td>9.10. 850 Interface Module</td><td>247</td></tr>
<tr><td>9.11. 835 Modem</td><td>253</td></tr>
<tr><td>9.12. 835 Hardware</td><td>256</td></tr>
<tr><td>9.13. 1030 Modem</td><td>257</td></tr>
<tr><td>9.14. 1030 Hardware</td><td>263</td></tr>
<tr><td>9.15. SX212 Modem</td><td>265</td></tr>
<tr><td>9.16. R-Verter</td><td>266</td></tr>
<tr><td>9.17. 410/1010 Program Recorder</td><td>267</td></tr>
<tr><td>9.18. MidiMate</td><td>267</td></tr>
<tr><td>9.19. Pocket Modem</td><td>268</td></tr>
<tr><td>10.  Disk drives</td><td>270</td></tr>
<tr><td>10.1. Introduction</td><td>271</td></tr>
<tr><td>10.2. Basic protocol</td><td>278</td></tr>
<tr><td>10.3. Extended protocols</td><td>280</td></tr>
<tr><td>10.4. Commands</td><td>286</td></tr>
<tr><td>10.5. Timing</td><td>288</td></tr>
<tr><td>10.6. Anomalies</td><td>294</td></tr>
<tr><td>10.7. 6532 RIOT</td><td>298</td></tr>
<tr><td>10.8. 177X/179X/279X FDC</td><td>299</td></tr>
<tr><td>10.9. 810 disk drive</td><td>301</td></tr>
<tr><td>10.10. 810 hardware</td><td>304</td></tr>
<tr><td>10.11. Happy 810</td><td>306</td></tr>
<tr><td>10.12. 810 Turbo</td><td>309</td></tr>
<tr><td>10.13. 815 disk drive</td><td>311</td></tr>
<tr><td>10.14. 815 hardware</td><td>313</td></tr>
<tr><td>10.15. 1050 disk drive</td><td>316</td></tr>
<tr><td>10.16. 1050 hardware</td><td>320</td></tr>
<tr><td>10.17. 1450XLD disk drive</td><td>322</td></tr>
<tr><td>10.18. 1450XLD disk hardware</td><td>324</td></tr>
<tr><td>10.19. US Doubler</td><td>326</td></tr>
<tr><td>10.20. Super Archiver</td><td>327</td></tr>
<tr><td>10.21. Happy 1050</td><td>330</td></tr>
<tr><td>10.22. I.S. Plate</td><td>336</td></tr>
<tr><td>10.23. XF551 disk drive</td><td>340</td></tr>
<tr><td>10.24. XF551 hardware</td><td>344</td></tr>
<tr><td>10.25. Speedy XF disk drive</td><td>345</td></tr>
<tr><td>10.26. Indus GT disk drive</td><td>347</td></tr>
<tr><td>10.27. Indus GT hardware</td><td>349</td></tr>
<tr><td>10.28. ATR8000 hardware</td><td>351</td></tr>
<tr><td>10.29. Percom RFD</td><td>354</td></tr>
<tr><td>10.30. Percom AT88</td><td>357</td></tr>
<tr><td>10.31. Percom AT88-SPD/S1PD</td><td>359</td></tr>
<tr><td>10.32. Amdek AMDC-I/II</td><td>361</td></tr>
<tr><td>11.  Parallel Bus Interface</td><td>365</td></tr>
<tr><td>11.1. Introduction</td><td>366</td></tr>
<tr><td>11.2. Common memory map</td><td>366</td></tr>
<tr><td>11.3. ICD Multi I/O (MIO)</td><td>367</td></tr>
<tr><td>11.4. CSS Black Box</td><td>370</td></tr>
<tr><td>11.5. CSS Black Box Floppy Board</td><td>373</td></tr>
<tr><td>11.6. Atari 1090 80 Column Video Card</td><td>376</td></tr>
<tr><td>11.7. Atari 1400XL/1450XLD</td><td>378</td></tr>
<tr><td>12.  Internal devices</td><td>380</td></tr>
<tr><td>12.1. Introduction</td><td>381</td></tr>
<tr><td>12.2. Covox</td><td>381</td></tr>
<tr><td>12.3. Ultimate1MB</td><td>381</td></tr>
<tr><td>12.4. VideoBoard XE</td><td>389</td></tr>
<tr><td>12.5. APE Warp+ OS 32-in-1</td><td>405</td></tr>
<tr><td>12.6. Bit-3 Full-View 80</td><td>406</td></tr>
<tr><td>13.  5200 SuperSystem</td><td>409</td></tr>
<tr><td>13.1. Introduction</td><td>410</td></tr>
<tr><td>13.2. Differences from the 8-bit computer line</td><td>410</td></tr>
<tr><td>13.3. Controller</td><td>411</td></tr>
<tr><td>13.4. 5200 Memory map</td><td>413</td></tr>
<tr><td>14.  Reference</td><td>414</td></tr>
<tr><td>14.1. Memory map</td><td>415</td></tr>
<tr><td>14.2. Register list</td><td>416</td></tr>
<tr><td>14.3. GTIA registers</td><td>417</td></tr>
<tr><td>14.4. POKEY registers</td><td>437</td></tr>
<tr><td>14.5. PIA registers</td><td>453</td></tr>
<tr><td>14.6. ANTIC registers</td><td>457</td></tr>
<tr><td>14.7. Register listing</td><td>469</td></tr>
<tr><td>15.  Bibliography</td><td>472</td></tr>
<tr><td>15.1. List of references</td><td>473</td></tr>
<tr><td>15.2. Errata</td><td>474</td></tr>
<tr><td>A.  Polynomial Counters</td><td>476</td></tr>
<tr><td>B.  Physical Disk Format</td><td>481</td></tr>
<tr><td>B.1. Raw geometry</td><td>482</td></tr>
<tr><td>B.2. Bit encoding</td><td>482</td></tr>
<tr><td>B.3. Address field</td><td>483</td></tr>
<tr><td>B.4. Data field</td><td>484</td></tr>
<tr><td>B.5. CRC algorithm</td><td>484</td></tr>
<tr><td>C.  Physical Tape Format</td><td>486</td></tr>
<tr><td>C.1. Signal encoding</td><td>487</td></tr>
<tr><td>C.2. Framing</td><td>487</td></tr>
<tr><td>C.3. FSK demodulation</td><td>487</td></tr>
<tr><td>C.4. Zero crossing detection</td><td>487</td></tr>
<tr><td>C.5. Peak detection</td><td>487</td></tr>
<tr><td>C.6. DFT detection</td><td>488</td></tr>
<tr><td>C.7. Quadrature demodulation</td><td>490</td></tr>
<tr><td>C.8. Asynchronous serial decoding</td><td>491</td></tr>
<tr><td>D.  Analog Video Model</td><td>492</td></tr>
<tr><td>D.1. Introduction</td><td>493</td></tr>
<tr><td>D.2. NTSC color encoding</td><td>493</td></tr>
<tr><td>D.3. NTSC artifacting</td><td>501</td></tr>
<tr><td>D.4. PAL color encoding</td><td>505</td></tr>
<tr><td>D.5. PAL artifacting</td><td>507</td></tr>
<tr><td>D.6. Synchronization</td><td>509</td></tr>
<tr><td>E.  Analog Audio Model</td><td>511</td></tr>
<tr><td>E.1. Introduction</td><td>512</td></tr>
<tr><td>E.2. POKEY output</td><td>512</td></tr>
<tr><td>E.3. First amplifier stage</td><td>513</td></tr>
<tr><td>E.4. External signal sum point</td><td>514</td></tr>
<tr><td>E.5. Second amplifier stage</td><td>514</td></tr>
<tr><td>E.6. Final output</td><td>516</td></tr>
<tr><td>F.  Firmware Database</td><td>517</td></tr>
<tr><td>F.1. Introduction</td><td>518</td></tr>
<tr><td>F.2. 5200 firmware</td><td>518</td></tr>
<tr><td>F.3. 400/800 firmware</td><td>518</td></tr>
<tr><td>F.4. XL/XE/XEGS firmware</td><td>519</td></tr>
<tr><td>F.5. Game cartridges</td><td>521</td></tr>
<tr><td>F.6. BASIC</td><td>521</td></tr>
<tr><td>F.7. Disk Drives</td><td>522</td></tr>
<tr><td>15.3. Printers</td><td>523</td></tr>
<tr><td>G.  Quick Reference</td><td>525</td></tr>
<tr><td>G.1. CPU opcode table</td><td>526</td></tr>
</table>

## Index of Tables

<table>
<tr><td>Table 1: Some extended memory configurations</td><td>38</td></tr>
<tr><td>Table 2: NMOS 6502 opcode table</td><td>49</td></tr>
<tr><td>Table 3: 65C02 opcode table</td><td>53</td></tr>
<tr><td>Table 4: 65C816 opcode table</td><td>54</td></tr>
<tr><td>Table 5: Typical power-up values for ANTIC registers</td><td>61</td></tr>
<tr><td>Table 6: ANTIC display timing</td><td>61</td></tr>
<tr><td>Table 7: DMA and shift clock rates by mode</td><td>82</td></tr>
<tr><td>Table 8: Distortion modes</td><td>106</td></tr>
<tr><td>Table 9: POKEY clock frequencies</td><td>111</td></tr>
<tr><td>Table 10: Serial port timing modes</td><td>115</td></tr>
<tr><td>Table 11: Key codes (scan matrix layout)</td><td>125</td></tr>
<tr><td>Table 12: Key codes (130XE keyboard layout)</td><td>125</td></tr>
<tr><td>Table 13: GTIA Register Map</td><td>135</td></tr>
<tr><td>Table 14: PAL GTIA color encodings</td><td>144</td></tr>
<tr><td>Table 15: Results of various size changes in the middle of a player image</td><td>149</td></tr>
<tr><td>Table 16: Priority logic outputs for unusual priority modes</td><td>152</td></tr>
<tr><td>Table 17: ANx bus encodings</td><td>156</td></tr>
<tr><td>Table 18: Timing for mid-screen writes to GTIA registers</td><td>157</td></tr>
<tr><td>Table 19: CX-85 keypad to PORTA bit pattern mapping</td><td>165</td></tr>
<tr><td>Table 20: Keyboard Controller key matrix</td><td>166</td></tr>
<tr><td>Table 21: Character bit to block graphics mapping</td><td>170</td></tr>
<tr><td>Table 22: XEP80 Timing Register Values</td><td>180</td></tr>
<tr><td>Table 23: Corvus Interface modes</td><td>182</td></tr>
<tr><td>Table 24: ComputerEyes controller port usage</td><td>183</td></tr>
<tr><td>Table 25: SIDE 1/2 register map</td><td>192</td></tr>
<tr><td>Table 26: SIDE 3 registers</td><td>197</td></tr>
<tr><td>Table 27: SIDE 3 registers changed by push button reset</td><td>197</td></tr>
<tr><td>Table 28: Multiplexer VIA connections</td><td>214</td></tr>
<tr><td>Table 29: SIO device IDs</td><td>218</td></tr>
<tr><td>Table 30: Peripheral Handler Relocation Record Types</td><td>229</td></tr>
<tr><td>Table 31: 820 memory map</td><td>232</td></tr>
<tr><td>Table 32: 820 RIOT port assignments</td><td>232</td></tr>
<tr><td>Table 33: 1025 Port I/O connections (8051)</td><td>240</td></tr>
<tr><td>Table 34: 1025 Port I/O connections (8155)</td><td>241</td></tr>
<tr><td>Table 35: 1029 Polish character encodings</td><td>245</td></tr>
<tr><td>Table 36: 1029 8039 I/O connections</td><td>246</td></tr>
<tr><td>Table 37: 850 printer status frame</td><td>252</td></tr>
<tr><td>Table 38: 835 Modem hardware commands</td><td>254</td></tr>
<tr><td>Table 39: Atari 835 8048 Microcontroller Connections</td><td>257</td></tr>
<tr><td>Table 40: 1030 Firmware Load Block Timing</td><td>259</td></tr>
<tr><td>Table 41: 1030 Modem hardware commands</td><td>260</td></tr>
<tr><td>Table 42: Atari 1030 8050 Microcontroller Connections</td><td>264</td></tr>
<tr><td>Table 43: SX212 supported commands</td><td>265</td></tr>
<tr><td>Table 44: Disk drive status frame</td><td>279</td></tr>
<tr><td>Table 45: Disk drive transfer rates</td><td>282</td></tr>
<tr><td>Table 46: PERCOM Block Contents</td><td>282</td></tr>
<tr><td>Table 47: Detected Percom blocks for various disk drives and formats</td><td>284</td></tr>
<tr><td>Table 48: Density detection behaviors of various disk drives</td><td>285</td></tr>
<tr><td>Table 49: Density reporting behaviors of various disk drives</td><td>285</td></tr>
<tr><td>Table 50: Disk drive transmit timings by firmware</td><td>289</td></tr>
<tr><td>Table 51: Disk drive step rate timings</td><td>290</td></tr>
<tr><td>Table 52: Disk format strategies by drive type</td><td>291</td></tr>
<tr><td>Table 53: Track sector layouts by drive type and format</td><td>294</td></tr>
<tr><td>Table 54: FDC status codes for various read sector conditions</td><td>294</td></tr>
<tr><td>Table 55: Disk drive behavior on Read Sector command with drive door/latch open and no disk inserted</td><td>296</td></tr>
<tr><td>Table 56: Ideal 810 sector read timing</td><td>298</td></tr>
<tr><td>Table 57: Step rates for various FDC models</td><td>300</td></tr>
<tr><td>Table 58: Head load delays for various FDC models</td><td>300</td></tr>
<tr><td>Table 59: 810 drive firmware revisions</td><td>303</td></tr>
<tr><td>Table 60: 810 memory map</td><td>304</td></tr>
<tr><td>Table 61: 810 RIOT I/O port assignments</td><td>306</td></tr>
<tr><td>Table 62: Happy 810 memory map</td><td>307</td></tr>
<tr><td>Table 63: Happy 810 rev.7 drive mode bits</td><td>309</td></tr>
<tr><td>Table 64: 810 Turbo memory map</td><td>310</td></tr>
<tr><td>Table 65: 815 memory map</td><td>314</td></tr>
<tr><td>Table 66: 815 RIOT I/O port assignments</td><td>315</td></tr>
<tr><td>Table 67: 1050 returned ROM signatures</td><td>317</td></tr>
<tr><td>Table 68: 1050 memory map</td><td>321</td></tr>
<tr><td>Table 69: 1050 RIOT I/O port assignments</td><td>322</td></tr>
<tr><td>Table 70: 1450XLD non-TONG controller I/O map</td><td>325</td></tr>
<tr><td>Table 71: 1450XLD TONG controller I/O map</td><td>326</td></tr>
<tr><td>Table 72: Super Archiver memory map</td><td>328</td></tr>
<tr><td>Table 73: Super Archiver memory map with Bit-Writer</td><td>328</td></tr>
<tr><td>Table 74: Bit-Writer PIA connections</td><td>329</td></tr>
<tr><td>Table 75: Happy 1050 Memory Map</td><td>330</td></tr>
<tr><td>Table 76: Happy 1050 drive mode bits</td><td>335</td></tr>
<tr><td>Table 77: I.S. Plate returned PERCOM option block</td><td>337</td></tr>
<tr><td>Table 78: I.S. Plate custom format parameters</td><td>338</td></tr>
<tr><td>Table 79: XF551 drive status flags</td><td>341</td></tr>
<tr><td>Table 80: XF551 PERCOM configuration block values</td><td>342</td></tr>
<tr><td>Table 81: XF551 firmware revisions</td><td>343</td></tr>
<tr><td>Table 82: XF551 8040 I/O port connections</td><td>345</td></tr>
<tr><td>Table 83: Speedy XF memory map</td><td>346</td></tr>
<tr><td>Table 84: Speedy XF RIOT connections</td><td>347</td></tr>
<tr><td>Table 85: Indus GT stock firmware revisions</td><td>347</td></tr>
<tr><td>Table 86: Commonly used Indus GT uploadable code fragments</td><td>348</td></tr>
<tr><td>Table 87: Indus GT memory map</td><td>350</td></tr>
<tr><td>Table 88: Indus GT status 1 port signals</td><td>350</td></tr>
<tr><td>Table 89: Indus GT status 2 port signals</td><td>350</td></tr>
<tr><td>Table 90: ATR8000 input port assignments</td><td>352</td></tr>
<tr><td>Table 91: ATR8000 drive control port layout (OUT 30-3FH)</td><td>353</td></tr>
<tr><td>Table 92: ATR8000 SIO status port layout (IN 70-7FH)</td><td>354</td></tr>
<tr><td>Table 93: ATR8000 printer status port layout (IN 20-2FH)</td><td>354</td></tr>
<tr><td>Table 94: Percom RFD firmware revisions</td><td>355</td></tr>
<tr><td>Table 95: Percom RFD-40S1 memory map</td><td>356</td></tr>
<tr><td>Table 96: Percom AT88 firmware revisions</td><td>357</td></tr>
<tr><td>Table 97: Percom AT88-S1 memory map</td><td>357</td></tr>
<tr><td>Table 98: Percom AT88-S1 PIA connections</td><td>358</td></tr>
<tr><td>Table 99: Percom AT88-SPD/S1PD firmware revisions</td><td>359</td></tr>
<tr><td>Table 100: Percom AT88-SPD/S1PD memory map</td><td>359</td></tr>
<tr><td>Table 101: Percom AT88-SPD/S1PD PIA connections</td><td>360</td></tr>
<tr><td>Table 102: Amdek AMDC-I/II memory map</td><td>363</td></tr>
<tr><td>Table 103: MIO memory map</td><td>367</td></tr>
<tr><td>Table 104: Black Box memory map</td><td>370</td></tr>
<tr><td>Table 105: Black Box Floppy Board 6504 address map</td><td>374</td></tr>
<tr><td>Table 106: Black Box Floppy Board VIA connections</td><td>375</td></tr>
<tr><td>Table 107: 80CVC hardware registers</td><td>377</td></tr>
<tr><td>Table 108: VBXE extended display list (XDL) entry format</td><td>391</td></tr>
<tr><td>Table 109: VBXE overlay priority bits</td><td>393</td></tr>
<tr><td>Table 110: VBXE attribute map block layout</td><td>394</td></tr>
<tr><td>Table 111: VBXE blitter setup block</td><td>396</td></tr>
<tr><td>Table 112: VBXE blit modes</td><td>397</td></tr>
<tr><td>Table 113: VBXE blitter speeds</td><td>398</td></tr>
<tr><td>Table 114: VBXE registers</td><td>400</td></tr>
<tr><td>Table 115: Bit-3 Full-View 80 $D508 register bits</td><td>407</td></tr>
<tr><td>Table 116: Measured signal levels for sync and all luminances</td><td>496</td></tr>
<tr><td>Table 117: NTSC saturation ratios</td><td>498</td></tr>
<tr><td>Table 118: Measured artifacting delays</td><td>502</td></tr>
<tr><td>Table 119: CPU opcode table</td><td>527</td></tr>
</table>

## Index of Figures

<table>
<tr><td>Figure 1: System Block Diagram</td><td>29</td></tr>
<tr><td>Figure 2: Effects of overlapping IRQ/NMI timing</td><td>48</td></tr>
<tr><td>Figure 3: Effect of vertical scrolling on mode lines</td><td>72</td></tr>
<tr><td>Figure 4: Abusing vertical scrolling in the “GTIA 9++” mode</td><td>73</td></tr>
<tr><td>Figure 5: ANTIC virtual DMA artifacts at end of scan line</td><td>88</td></tr>
<tr><td>Figure 6: ANTIC event timing</td><td>97</td></tr>
<tr><td>Figure 7: DMA and CPU timing for DLI handler</td><td>99</td></tr>
<tr><td>Figure 8: POKEY detailed timer timing</td><td>110</td></tr>
<tr><td>Figure 9: SIO send/receive clocking signals</td><td>117</td></tr>
<tr><td>Figure 10: POKEY asynchronous serial receive timing</td><td>120</td></tr>
<tr><td>Figure 11: POKEY synchronous serial receive/transmit timing</td><td>121</td></tr>
<tr><td>Figure 12: Phantom key formation</td><td>128</td></tr>
<tr><td>Figure 13: GTIA NTSC vertical sync waveform</td><td>138</td></tr>
<tr><td>Figure 14: ANTIC mis-signaling to GTIA during hires bug</td><td>139</td></tr>
<tr><td>Figure 15: Shifted horizontal sync due to hires bug</td><td>141</td></tr>
<tr><td>Figure 16: CX-75 triggering glitch on NTSC 800XL</td><td>164</td></tr>
<tr><td>Figure 17: Veronica memory layout</td><td>210</td></tr>
<tr><td>Figure 18: SIO command timing</td><td>221</td></tr>
<tr><td>Figure 19: 820 normal and sideways character sets</td><td>231</td></tr>
<tr><td>Figure 20: 1025 character set</td><td>239</td></tr>
<tr><td>Figure 21: 1029 character set</td><td>243</td></tr>
<tr><td>Figure 22: Ultimate1MB flash memory map</td><td>383</td></tr>
<tr><td>Figure 23: YIQ/YUV color space relations</td><td>494</td></tr>
<tr><td>Figure 24: Effect of color correction on computed palette</td><td>499</td></tr>
<tr><td>Figure 25: Altirra NTSC high artifacting pipeline</td><td>505</td></tr>
<tr><td>Figure 26: Altirra PAL high artifacting pipeline</td><td>509</td></tr>
<tr><td>Figure 27: Analog audio block model</td><td>512</td></tr>
<tr><td>Figure 28: Decay from second stage amplifier</td><td>514</td></tr>
<tr><td>Figure 29: Dynamic clamping effect</td><td>515</td></tr>
</table>

Copyright © 2009-2024 Avery Lee, All Rights Reserved.

Permission is granted to redistribute this document in verbatim form as long as it is done free of charge and for non-commercial purposes.

All trademarks are the property of their respective owners.

While the information in this document is presumed correct, no guarantee is provided as to its accuracy or fitness for a particular use.
