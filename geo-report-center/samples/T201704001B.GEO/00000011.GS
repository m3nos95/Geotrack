<?xml version="1.0" standalone="yes"?>
<GEOTECHNICAL_PROJECT>
  <GRAIN_SIZE>
    <GSTestSettings>
      <SpecEnvelope name=""/>
      <SieveSizesList name="(Default opening sizes)"/>
      <MaxDensitySieve>
        <OpeningSize readable_size="" units="IN."/>
      </MaxDensitySieve>
      <ChartOmitsCurve set="no"/>
      <ParticleBreakdown set="AASHTO"/>
      <HydrometerTestSettings>
        <OpeningSize readable_size="#10" units="IN."/>
        <Consts151h a="0.2645" b="16.294964"/>
        <Consts152h a="0.164" b="16.294964"/>
        <Using151h set="no"/>
        <LinearTempCorr>
          <Points>
            <Point temp="20.0" corr="-6.45"/>
            <Point temp="21.5" corr="-5.80"/>
            <Point temp="21.0" corr="-6.05"/>
            <Point temp="22.5" corr="-5.50"/>
            <Point temp="22.0" corr="-5.60"/>
            <Point temp="20.5" corr="-6.25"/>
          </Points>
        </LinearTempCorr>
      </HydrometerTestSettings>
      <SieveTestSettings>
        <Test style="cumulative"/>
      </SieveTestSettings>
    </GSTestSettings>
    <SieveTest>
      <WashTest>
        <SampleWt>
          <Tare id="" wt=""/>
        </SampleWt>
      </WashTest>
      <Sample>
        <SampleWt>686.93
          <Tare id="" wt="0"/>
        </SampleWt>
        <CumulativePan>
          <Tare id="" wt="0"/>
        </CumulativePan>
      </Sample>
      <TestPoint>
        <Sieve wtretained="0">
          <OpeningSize readable_size="2&quot;" units="IN."/>
        </Sieve>
      </TestPoint>
      <TestPoint>
        <Sieve wtretained="34.2">
          <OpeningSize readable_size="1&quot;" units="IN."/>
        </Sieve>
      </TestPoint>
      <TestPoint>
        <Sieve wtretained="48.8">
          <OpeningSize readable_size="3/8&quot;" units="IN."/>
        </Sieve>
      </TestPoint>
      <TestPoint>
        <Sieve wtretained="57">
          <OpeningSize readable_size="#4" units="IN."/>
        </Sieve>
      </TestPoint>
      <TestPoint>
        <Sieve wtretained="61">
          <OpeningSize readable_size="#10" units="IN."/>
        </Sieve>
      </TestPoint>
      <Sample>
        <SampleWt>103.4
          <Tare id="" wt="0"/>
        </SampleWt>
        <CumulativePan>
          <Tare id="" wt="0"/>
        </CumulativePan>
      </Sample>
      <TestPoint>
        <Sieve wtretained="37.6">
          <OpeningSize readable_size="#40" units="IN."/>
        </Sieve>
      </TestPoint>
      <TestPoint>
        <Sieve wtretained="93.4">
          <OpeningSize readable_size="#200" units="IN."/>
        </Sieve>
      </TestPoint>
    </SieveTest>
    <HydrometerTest>
      <Hydrometer type="152H" a="0.164" b="16.294964"/>
      <LinearTempCorr>
        <Points>
          <Point temp="20.0" corr="-6.45"/>
          <Point temp="21.5" corr="-5.80"/>
          <Point temp="21.0" corr="-6.05"/>
          <Point temp="22.5" corr="-5.50"/>
          <Point temp="22.0" corr="-5.60"/>
          <Point temp="20.5" corr="-6.25"/>
        </Points>
      </LinearTempCorr>
      <MeniscusCorrection val=""/>
      <SampleWt val=""/>
      <PercentPassingSplit val=""/>
      <SpecificGravity val=""/>
    </HydrometerTest>
    <ShapingPoints>
    </ShapingPoints>
  </GRAIN_SIZE>
</GEOTECHNICAL_PROJECT>
