import HistoricalStdlibVersions
import Pkg
using Test

append!(empty!(Pkg.Types.STDLIBS_BY_VERSION), HistoricalStdlibVersions.STDLIBS_BY_VERSION)

@test !isempty(Pkg.Types.STDLIBS_BY_VERSION)