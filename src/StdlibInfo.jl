# NOTE: This file is also included by `ext/HistorialStdlibGenerator/generate_historical_stdlibs.jl`
using Pkg

import Base: UUID

# Use the `Pkg` `StdlibInfo` type if it exists, otherwise just re-define it
if !isdefined(Pkg.Types, :StdlibInfo)
struct StdlibInfo
    name::String
    uuid::UUID

    # This can be `nothing` if it's an unregistered stdlib
    version::Union{Nothing,VersionNumber}

    deps::Vector{UUID}
    weakdeps::Vector{UUID}
end
else
import Pkg.Types: StdlibInfo
end

